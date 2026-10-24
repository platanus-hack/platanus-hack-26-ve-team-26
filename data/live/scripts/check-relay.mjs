// Both halves of the phone-as-camera relay (src/relay.js) against a running server, without a
// browser: a fake phone sends the synthetic walker of check.mjs at 30 fps through createPhoneSender,
// a fake Mac receives it through createPhoneCapture, records, and the PoseClip must follow the
// contract and keep the walker's speed; every other frame carries a camera image of a real JPEG's
// size, which the Mac must show. Then the phone goes quiet and the Mac must notice.
//
//   uv run --project data python -m data.server &      # or data/serve.sh
//   cd data/live && npm run check-relay                 # TRIDI_API=<url> for another server
import { createPhoneCapture, createPhoneSender, openPhoneSession, phonePageUrl, toFrame, toPose } from '../src/relay.js';

const API = process.env.TRIDI_API ?? 'http://127.0.0.1:8000';
const SPEED = 1.2; // m/s, as in check.mjs
const SECONDS = 4;
const W = 1280;
const H = 720;

const fail = [];
const check = (ok, msg) => (ok ? console.log(`ok: ${msg}`) : fail.push(msg));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// The walker of check.mjs, as what onPose gives: world {x, y, z} in meters and image landmarks
// normalized to the frame, with visibility. `t` is seconds into the walk; `at` the pose's clock
// time (createLiveCapture stamps performance.now() / 1000, the same clock toFrame uses for a
// frame without body).
function pose(t, at = t) {
  const F = W / (2 * Math.tan((65 * Math.PI) / 360));
  const hip = [-2 + SPEED * t, 0, 4];
  const joints = Array.from({ length: 33 }, () => [0, -0.6, 0]);
  const set = (i, p) => (joints[i] = p);
  set(11, [0, -0.5, -0.18]); set(12, [0, -0.5, 0.18]);
  set(13, [0, -0.25, -0.2]); set(14, [0, -0.25, 0.2]);
  set(15, [0.05, 0, -0.2]); set(16, [0.05, 0, 0.2]);
  set(23, [0, 0, -0.1]); set(24, [0, 0, 0.1]);
  for (const [side, offset] of [[0, 0], [1, 1]]) {
    const phase = (t / 0.5 + offset) % 2;
    const cycle = Math.floor(t / 0.5 + offset) - (phase >= 1 ? 1 : 0);
    const planted = (cycle * 0.5 - offset * 0.5) * SPEED + SPEED * 0.5;
    const footX = phase < 1 ? planted : planted + (phase - 1) * 2 * SPEED * 0.5;
    const lift = phase < 1 ? 0 : 0.1 * Math.sin((phase - 1) * Math.PI);
    const z = side === 0 ? -0.1 : 0.1;
    const rel = footX - 2 - hip[0];
    set(25 + side, [rel / 2, 0.45, z]);
    set(27 + side, [rel, 0.85 - lift, z]);
    set(29 + side, [rel - 0.05, 0.9 - lift, z]);
    set(31 + side, [rel + 0.15, 0.9 - lift, z]);
  }
  const landmarks = joints.map((p) => {
    const c = [p[0] + hip[0], p[1] + hip[1], p[2] + hip[2]];
    return { x: ((F * c[0]) / c[2] + W / 2) / W, y: ((F * c[1]) / c[2] + H / 2) / H, visibility: 0.9 };
  });
  return { landmarks, world: joints.map(([x, y, z]) => ({ x, y, z })), visible: true, t: at };
}

// Pure parts first.
const url = phonePageUrl('https://tridi-alpha.vercel.app/', 'https://abc.trycloudflare.com/', 'k7m3qx2p');
check(url === 'https://tridi-alpha.vercel.app/?api=https%3A%2F%2Fabc.trycloudflare.com#/camara/k7m3qx2p', `phone page url: ${url}`);
const back = toPose(toFrame(pose(1)));
check(back.visible && back.world.length === 33 && Math.abs(back.world[27].x - pose(1).world[27].x) < 0.001, 'a pose survives the wire (1 mm)');
check(toPose(toFrame(null, 3)) === null && toFrame(null, 3).t === 3, 'no body is a bare t');

// A session, a phone that walks for 4 s, a Mac that records it.
const health = await fetch(`${API}/health`).then((r) => r.json()).catch(() => null);
if (!health?.ok) {
  console.error(`no server at ${API}: start data/server.py first (see the header of this file)`);
  process.exit(1);
}
const { sessionId } = await openPhoneSession(API);
check(/^[23456789abcdefghjkmnpqrstuvwxyz]{8}$/.test(sessionId), `session ${sessionId}`);

const statuses = [];
const poses = [];
const images = [];
const mac = createPhoneCapture(API, sessionId, {
  onPose: (p) => poses.push(p),
  onImage: (src) => images.push(src),
  onStatus: (s) => statuses.push(s.state),
});
await sleep(300);
check(statuses.includes('waiting'), 'the Mac waits for the phone');

const phoneStatuses = [];
const phone = createPhoneSender(API, sessionId, { onStatus: (s) => phoneStatuses.push(s) });
const t0 = performance.now() / 1000;
let frames = 0;
let recordingStarted = false;
const phoneTimer = setInterval(() => {
  const now = performance.now() / 1000;
  if (now - t0 > SECONDS) return;
  // One lost frame in 40, like a webcam; an image every other frame, ~20 KB of base64 like a real one.
  const jpeg = frames % 2 ? null : `/9j/${String(frames).padStart(4, '0')}${'A'.repeat(20_000)}`;
  phone.push(frames % 40 === 39 ? null : pose(now - t0, now), W, H, jpeg);
  frames++;
  if (!recordingStarted && poses.length) {
    mac.startRecording(); // the screen records from the first frame that arrives
    recordingStarted = true;
  }
}, 1000 / 30);

await sleep((SECONDS + 1) * 1000);
clearInterval(phoneTimer);
const clip = mac.stopRecording();
const last = clip.frames.at(-1);
const hips = [0, 2].map((a) => (last.joints[23][a] + last.joints[24][a]) / 2);
const speed = Math.hypot(...hips) / last.t;
check(poses.length >= frames * 0.95, `the Mac played ${poses.length} of ${frames} frames (one every 40 had no body)`);
check(poses.filter((p) => p === null).length >= Math.floor(frames / 40) - 1, 'the lost frames arrived as null');
check(statuses.at(-1) === 'streaming', `Mac status went ${[...new Set(statuses)].join(' → ')}`);
check(phoneStatuses.at(-1)?.state === 'sending' && phoneStatuses.at(-1).fps >= 20, `phone status: ${phoneStatuses.at(-1)?.state} at ${phoneStatuses.at(-1)?.fps} fps`);
check(clip.skeleton === 'mediapipe33' && clip.fps === 30 && clip.frames.length >= (SECONDS - 1) * 30, `PoseClip with ${clip.frames.length} frames`);
check(clip.quality.valid_ratio > 0.9 && clip.quality.valid_ratio < 1, `valid_ratio ${clip.quality.valid_ratio} (the lost frames count)`);
check(Math.abs(speed - SPEED) < 0.2, `the walker's speed came through: ${speed.toFixed(2)} m/s (expected ${SPEED})`);
check(images.length >= (frames / 2) * 0.95, `the Mac showed ${images.length} images of ${Math.ceil(frames / 2)}`);
check(images.every((src) => src.startsWith('data:image/jpeg;base64,/9j/')), 'as data: URLs of a JPEG');
const order = images.map((src) => Number(src.slice(27, 31)));
check(order.every((n, i) => !i || n > order[i - 1]), 'in the order they were filmed');
check(mac.size().width === W && mac.size().height === H, 'the phone image size came along');

// The phone goes quiet: the Mac notices in PHONE_SILENCE_S.
phone.stop();
await sleep(6500);
check(statuses.at(-1) === 'lost', `after 6 s of silence the Mac says ${statuses.at(-1)}`);

// The Mac stops: the session is gone for the phone too.
mac.stop();
await sleep(300);
const gone = await fetch(`${API}/live/${sessionId}/poses`).then((r) => r.status);
check(gone === 404, 'stop() ended the session on the server');

if (fail.length) {
  console.error(`FAIL:\n- ${fail.join('\n- ')}`);
  process.exit(1);
}
console.log('relay check passed');
