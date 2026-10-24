// The phone as the live camera (docs/contrato.md, "El teléfono como cámara"). Two halves that only
// meet at the server (data/relay.py), which passes frames from one to the other in memory:
//
// - the phone (web #/camara/<session>): createLiveCapture with the back camera, and
//   createPhoneSender posts what onPose gives, in batches, with a small JPEG of the camera image
//   (createImageGrabber) in some of the frames;
// - the Mac (web #/en-vivo): createPhoneCapture long-polls those frames and offers the same
//   interface as createLiveCapture ({ startRecording, stopRecording, isRecording, fps, stop }),
//   so the screen, the robot's mimic and buildPoseClip do not know which camera it was; onImage
//   gives the camera image of the frame being played, to show under the skeleton.
//
// The One Euro filter runs once, on the phone (inside createLiveCapture); the Mac plays the frames
// as they are. Works in the browser and in Node 18+ (fetch), like upload.js; scripts/check-relay.mjs
// runs both halves against the real server.
import { buildPoseClip, cameraTranslation, isSeen } from './poseclip.js';
import { UploadError } from './upload.js';

// The phone posts every 100 ms (3 frames at 30 fps, ~5 KB). One request per frame would be 30 a
// second through the tunnel; 500 ms batches would add half a second of delay.
export const PHONE_BATCH_MS = 100;

// A batch that fails to send waits for the next tick with the new frames. Up to 30 frames (1 s)
// are kept that way: later than that the robot would copy the past, and 30 frames fit the
// server's 64 KB per batch.
const PENDING_MAX = 30;

// The camera image the Mac shows under the skeleton (docs/contrato.md): 15 fps is every other frame
// and reads as video; 480 px on the long side fills half a laptop screen; JPEG at 60 % is ~15 to
// 25 KB. Together ~300 KB/s through the tunnel, while the phone still runs MediaPipe at 30 fps.
export const IMAGE_FPS = 15;
const IMAGE_LONG_SIDE = 480;
const IMAGE_QUALITY = 0.6;

// Only the newest frames of a batch keep their image: 4 frames hold 2 images at 15 fps, a normal
// batch. A batch that piled up behind a slow upload sends its older frames without images: the Mac
// would only show the newest anyway, and the batch stays far under the server's 256 KB.
const IMAGE_FRAMES_PER_BATCH = 4;

// The Mac asks with wait=1000 and asks again at once: answers come as soon as a batch lands, and
// an idle session (QR on screen) is one request per second. Same number as the contract.
const POLL_WAIT_MS = 1000;

// After a failed poll (tunnel hiccup) the Mac tries again in half a second: fast enough to lose
// little, slow enough not to hammer a server that is down.
const POLL_RETRY_MS = 500;

// Without frames for this long the phone is lost: a tunnel cut lasts 1 or 2 s; a phone that locked
// its screen never comes back. The screen decides what to do (go back to the webcam).
export const PHONE_SILENCE_S = 5;

// Frames arrive in bursts (one batch every ~100 ms). Played on arrival the robot would move in
// 10 Hz steps; instead each frame plays at its phone time plus a lead: the largest delay seen on
// arrivals in the last 2 s, plus a margin for timer jitter. The burst spreads back into 30 fps
// with the least delay that still keeps every frame from arriving late. 2 s forgets a one-off
// hiccup quickly; 20 ms is about one frame of timer jitter.
const PLAYOUT_WINDOW_MS = 2000;
const PLAYOUT_MARGIN_MS = 20;

// Numbers on the wire: world to 1 mm (MediaPipe is good to centimeters), image to 1/10000 of the
// frame (0.13 px at 1280) and visibility to 1 %. Any finer only makes the batch heavier.
const mm = (v) => Math.round(v * 1000) / 1000;
const tenThousandth = (v) => Math.round(v * 10000) / 10000;
const percent = (v) => Math.round(v * 100) / 100;

const base = (url) => url.replace(/\/$/, '');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function call(url, init) {
  const res = await fetch(url, init);
  if (!res.ok) {
    const detail = await res.json().then((b) => b.detail).catch(() => null);
    const error = new UploadError(detail ?? `el servidor respondió ${res.status}`);
    error.status = res.status;
    throw error;
  }
  return res.status === 204 ? null : res.json();
}

/** Opens a session on the server. Returns { sessionId, ttlS }. */
export async function openPhoneSession(baseUrl) {
  const { session_id, ttl_s } = await call(`${base(baseUrl)}/live`, { method: 'POST' });
  return { sessionId: session_id, ttlS: ttl_s };
}

/** Ends a session; the other side sees 404 and stops. Never throws: it runs while leaving. */
export async function closePhoneSession(baseUrl, sessionId) {
  try {
    await call(`${base(baseUrl)}/live/${sessionId}`, { method: 'DELETE' });
  } catch {
    /* already gone, or offline: either way it is over */
  }
}

/**
 * The address the QR holds: the web with the server in ?api= (so resolveApiUrl on the phone finds
 * it) and the session in the hash route.
 * @param webUrl  the deployed web's page, e.g. https://tridi-alpha.vercel.app/
 */
export function phonePageUrl(webUrl, apiUrl, sessionId) {
  const page = new URL(webUrl);
  page.search = `?api=${encodeURIComponent(base(apiUrl))}`;
  page.hash = `#/camara/${sessionId}`;
  return page.toString();
}

/** The frame the contract sends for what onPose gave (null when no body), with its JPEG if any. */
export function toFrame(pose, t = performance.now() / 1000, jpeg = null) {
  const frame = !pose
    ? { t: mm(t) }
    : {
        t: mm(pose.t),
        world: pose.world.map((p) => [mm(p.x), mm(p.y), mm(p.z)]),
        image: pose.landmarks.map((p) => [tenThousandth(p.x), tenThousandth(p.y), percent(p.visibility ?? 0)]),
      };
  if (jpeg) frame.jpeg = jpeg;
  return frame;
}

/**
 * The phone's camera image for the Mac: call grab() on every onPose; at most IMAGE_FPS times a
 * second it returns the video's current image as a small JPEG in base64, otherwise null.
 * Browser only (it draws the video on a canvas).
 */
export function createImageGrabber(video) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  // Frames come every ~33 ms with some jitter: a 10 ms slack keeps every other one instead of
  // skipping to every third.
  const every = 1000 / IMAGE_FPS - 10;
  let last = -Infinity;
  return {
    grab() {
      const now = performance.now();
      const { videoWidth: w, videoHeight: h } = video;
      if (now - last < every || !w || !h) return null;
      last = now;
      const scale = Math.min(1, IMAGE_LONG_SIDE / Math.max(w, h));
      const [cw, ch] = [Math.round(w * scale), Math.round(h * scale)];
      if (canvas.width !== cw || canvas.height !== ch) [canvas.width, canvas.height] = [cw, ch];
      ctx.drawImage(video, 0, 0, cw, ch);
      return canvas.toDataURL('image/jpeg', IMAGE_QUALITY).split(',')[1] ?? null;
    },
  };
}

/** What onPose gives, rebuilt from a frame of the contract (null when the frame had no body). */
export function toPose(frame) {
  if (!frame.world) return null;
  const landmarks = frame.image.map(([x, y, visibility]) => ({ x, y, visibility }));
  const visible = isSeen((i) => landmarks[i].visibility);
  return { landmarks, world: frame.world.map(([x, y, z]) => ({ x, y, z })), visible, t: frame.t };
}

/**
 * The phone's half: collects poses and posts them in batches.
 * @param options.onStatus  ({ state, fps, watchedS }) after every batch. state: 'sending' (the Mac
 *   is listening), 'unwatched' (the Mac has not asked for PHONE_SILENCE_S), 'offline' (the server
 *   does not answer; frames wait for the next try), 'ended' (the session is gone: stop the camera).
 * @returns { push(pose, width, height), stop() }
 */
export function createPhoneSender(baseUrl, sessionId, { onStatus } = {}) {
  const url = `${base(baseUrl)}/live/${sessionId}/poses`;
  let pending = [];
  let size = { width: 0, height: 0 };
  let inFlight = false;
  let ended = false;
  const sent = []; // when each of the last frames was sent, for fps

  async function flush() {
    if (inFlight || ended || !pending.length || !size.width) return;
    const frames = pending;
    pending = [];
    for (const f of frames.slice(0, -IMAGE_FRAMES_PER_BATCH)) delete f.jpeg;
    inFlight = true;
    try {
      const res = await call(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...size, frames }),
      });
      const now = performance.now();
      for (const _ of frames) sent.push(now);
      while (sent[0] < now - 1000) sent.shift();
      const watchedS = res.watched_s;
      onStatus?.({ state: watchedS === null || watchedS > PHONE_SILENCE_S ? 'unwatched' : 'sending', fps: sent.length, watchedS });
    } catch (e) {
      if (e instanceof UploadError && e.status === 404) {
        ended = true;
        onStatus?.({ state: 'ended', fps: 0, watchedS: null });
        return;
      }
      if (e instanceof UploadError) throw e; // the batch is malformed: a bug, not the network
      // The network: try them again with the next tick, without their images (stale by then).
      for (const f of frames) delete f.jpeg;
      pending = [...frames, ...pending].slice(-PENDING_MAX);
      onStatus?.({ state: 'offline', fps: 0, watchedS: null });
    } finally {
      inFlight = false;
    }
  }

  const timer = setInterval(() => flush().catch((e) => console.error(e)), PHONE_BATCH_MS);
  return {
    /**
     * Call with what onPose gives (null when no body), the camera image's pixel size, and the
     * image itself when createImageGrabber gave one.
     */
    push(pose, width, height, jpeg = null) {
      if (ended) return;
      size = { width, height };
      pending.push(toFrame(pose, undefined, jpeg));
      if (pending.length > PENDING_MAX) pending.shift();
    },
    stop() {
      ended = true;
      clearInterval(timer);
    },
  };
}

/**
 * The Mac's half: the phone's frames played like the webcam's. Same interface as createLiveCapture,
 * plus source, size() and the status callback.
 * @param options.onPose    as in createLiveCapture: ({ landmarks, world, visible, t }) or null
 * @param options.onImage   (src) the phone's camera image as a data: URL, just before the onPose of
 *   the frame it came with; frames without one keep the last image on screen
 * @param options.onStatus  ({ state, sentS }) when it changes. state: 'waiting' (no frames yet),
 *   'streaming', 'lost' (PHONE_SILENCE_S without frames after some arrived), 'ended' (the session
 *   is gone: the phone or the server closed it).
 */
export function createPhoneCapture(baseUrl, sessionId, { onPose, onImage, onStatus } = {}) {
  const url = `${base(baseUrl)}/live/${sessionId}/poses`;
  const controller = new AbortController();
  const raf = globalThis.requestAnimationFrame ?? ((fn) => setTimeout(fn, 16));
  const cancel = globalThis.cancelAnimationFrame ?? clearTimeout;
  let running = true;
  let state = null;
  let size = { width: 0, height: 0 };
  let next = 0;
  let lastFrameAt = 0; // local time of the last arrival
  const queue = []; // frames waiting for their play time
  const arrivals = []; // { at, lag } of recent frames, for the playout lead
  const played = []; // when each of the last played frames went out, for fps()
  let samples = null; // non-null while recording
  let frameId = 0;

  const setState = (s, sentS = null) => {
    if (s === state) return;
    state = s;
    onStatus?.({ state: s, sentS });
  };

  async function poll() {
    while (running) {
      let res;
      try {
        res = await call(`${url}?since=${next}&wait=${POLL_WAIT_MS}`, { signal: controller.signal });
      } catch (e) {
        if (!running) return;
        if (e instanceof UploadError && e.status === 404) return void setState('ended');
        await sleep(POLL_RETRY_MS); // the tunnel or the server hiccupped
        continue;
      }
      next = res.next;
      if (res.width) size = { width: res.width, height: res.height };
      const now = performance.now();
      if (res.frames.length) {
        lastFrameAt = now;
        for (const f of res.frames) {
          arrivals.push({ at: now, lag: now - f.t * 1000 });
          queue.push(f);
        }
        setState('streaming', res.sent_s);
      } else if (lastFrameAt && now - lastFrameAt > PHONE_SILENCE_S * 1000) {
        setState('lost', res.sent_s);
      } else if (!lastFrameAt) {
        setState('waiting', res.sent_s);
      }
    }
  }

  function tick() {
    if (!running) return;
    const now = performance.now();
    while (arrivals.length && arrivals[0].at < now - PLAYOUT_WINDOW_MS) arrivals.shift();
    const lead = Math.max(...arrivals.map((a) => a.lag)) + PLAYOUT_MARGIN_MS;
    while (queue.length && queue[0].t * 1000 + lead <= now) play(queue.shift(), now);
    frameId = raf(tick);
  }

  function play(frame, now) {
    played.push(now);
    while (played[0] < now - 1000) played.shift();
    if (frame.jpeg) onImage?.(`data:image/jpeg;base64,${frame.jpeg}`);
    const pose = toPose(frame);
    if (pose) pose.camera = cameraTranslation(pose.world, pose.landmarks, size.width, size.height);
    onPose?.(pose);
    if (!samples) return;
    if (!pose) samples.push({ t: frame.t, valid: false });
    else {
      samples.push({
        t: frame.t,
        world: frame.world,
        image: frame.image.map(([x, y, v]) => [x * size.width, y * size.height, v]),
        valid: pose.visible,
      });
    }
  }

  setState('waiting'); // the screen shows the QR right away; the first poll answers in a second
  poll().catch((e) => console.error(e));
  frameId = raf(tick);

  return {
    source: 'phone',
    /** The phone camera's image in pixels (0 until the first batch). */
    size: () => size,
    startRecording() {
      samples = [];
    },
    /** Ends the recording and returns its PoseClip; throws if the body was barely seen. */
    stopRecording() {
      const recorded = samples ?? [];
      samples = null;
      return buildPoseClip(recorded, size);
    },
    isRecording: () => samples !== null,
    /** Frames played in the last second, like createLiveCapture's. */
    fps: () => played.length,
    /** Stops polling and ends the session on the server (the phone sees it and stops). */
    stop() {
      running = false;
      cancel(frameId);
      controller.abort();
      closePhoneSession(baseUrl, sessionId);
    },
  };
}
