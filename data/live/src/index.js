// Public API of data/live for the web app: live camera -> MediaPipe pose every frame -> PoseClip.
// The same PoseClip that data/extract.py makes from an uploaded video, with source "camera".
import { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision';
import { PoseFilter } from './oneeuro.js';
import { BODY, MIN_VISIBILITY, buildPoseClip } from './poseclip.js';

export { buildPoseClip } from './poseclip.js';
export { PoseFilter } from './oneeuro.js';
export { drawSkeleton } from './draw.js';
export { checkApi, resolveApiUrl } from './api.js';
export { UploadError, chooseSubject, fetchClip, firstFrameUrl, sendClip, trainClip, uploadVideo, watchJob, watchTraining } from './upload.js';

// The WASM runtime and the models come from their official hosts, pinned to the package version
// in package.json, so the web build does not have to copy them.
const WASM_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.1.1/wasm';
const MODEL_URL = (variant) =>
  `https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_${variant}/float16/latest/pose_landmarker_${variant}.task`;

// "full" keeps 30 fps on a laptop GPU and is clearly steadier than "lite" on legs; phones should
// pass "lite" (half the work). "heavy" is for offline video only (data/lift.py).
const DEFAULT_MODEL = 'full';

// 1280x720 is enough for a full body a few meters away; asking for more only slows the model.
const CAMERA = { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' };

export class CameraError extends Error {}

/**
 * @param video  a <video> element; the module puts the camera stream in it (muted, inline)
 * @param options.model       'full' (default) or 'lite'
 * @param options.stream      a MediaStream to use instead of the camera (e.g. a video file's
 *   captureStream(), for tests and demos without a webcam)
 * @param options.smooth      true (default): every point goes through a causal One Euro filter
 *   (src/oneeuro.js) before onPose and the recording, so the robot copying the person does not shake
 *   with MediaPipe's per-frame noise. false gives MediaPipe's raw output.
 * @param options.onProgress  ({ stage: 'model' | 'camera', done: boolean }) while loading
 * @param options.onPose      ({ landmarks, world, visible, t }) every processed frame: `landmarks`
 *   are 33 points normalized to the video (for drawSkeleton), `world` 33 points in meters
 *   (hip-centered, MediaPipe axes), `visible` false when no body or too occluded; null if no body.
 * @returns { startRecording, stopRecording, isRecording, fps, stop }
 */
export async function createLiveCapture(video, { model = DEFAULT_MODEL, stream, smooth = true, onProgress, onPose } = {}) {
  onProgress?.({ stage: 'model', done: false });
  const vision = await FilesetResolver.forVisionTasks(WASM_URL);
  const landmarker = await PoseLandmarker.createFromOptions(vision, {
    baseOptions: { modelAssetPath: MODEL_URL(model), delegate: 'GPU' },
    runningMode: 'VIDEO',
    numPoses: 1,
  });
  onProgress?.({ stage: 'model', done: true });

  onProgress?.({ stage: 'camera', done: false });
  try {
    stream ??= await navigator.mediaDevices.getUserMedia({ video: CAMERA, audio: false });
  } catch (e) {
    landmarker.close();
    const denied = e?.name === 'NotAllowedError' || e?.name === 'SecurityError';
    throw new CameraError(
      denied
        ? 'Sin permiso para usar la cámara. Actívalo en la barra de direcciones del navegador y vuelve a intentar.'
        : 'No se encontró una cámara disponible.',
    );
  }
  video.srcObject = stream;
  video.muted = true;
  video.playsInline = true;
  await video.play();
  onProgress?.({ stage: 'camera', done: true });

  let samples = null; // non-null while recording
  let recordStart = 0;
  let lastVideoTime = -1;
  let frameId = 0;
  let running = true;
  const times = []; // when each of the last frames was processed, for fps()
  const filter = new PoseFilter();

  function frame() {
    if (!running) return;
    // Only new camera frames: the display refreshes faster than most webcams deliver.
    if (video.readyState >= 2 && video.currentTime !== lastVideoTime) {
      lastVideoTime = video.currentTime;
      const now = performance.now();
      times.push(now);
      while (times[0] < now - 1000) times.shift();
      const res = landmarker.detectForVideo(video, now);
      let landmarks = res.landmarks[0];
      let world = res.worldLandmarks[0];
      if (!landmarks || !world) {
        filter.reset(); // the body was lost: the next one starts fresh, not from where this one left
        onPose?.(null);
        samples?.push({ t: (now - recordStart) / 1000, valid: false });
      } else {
        if (smooth) [world, landmarks] = smoothed(filter, now / 1000, world, landmarks);
        const vis = landmarks.map((p) => p.visibility ?? 0);
        const visible = BODY.reduce((s, i) => s + vis[i], 0) / BODY.length >= MIN_VISIBILITY;
        onPose?.({ landmarks, world, visible, t: now / 1000 });
        const w = video.videoWidth;
        const h = video.videoHeight;
        samples?.push({
          t: (now - recordStart) / 1000,
          world: world.map((p) => [p.x, p.y, p.z]),
          image: landmarks.map((p, i) => [p.x * w, p.y * h, vis[i]]),
          valid: visible,
        });
      }
    }
    frameId = requestAnimationFrame(frame);
  }
  frameId = requestAnimationFrame(frame);

  return {
    startRecording() {
      samples = [];
      recordStart = performance.now();
    },
    /** Ends the recording and returns its PoseClip; throws if the body was barely seen. */
    stopRecording() {
      const recorded = samples ?? [];
      samples = null;
      return buildPoseClip(recorded, { width: video.videoWidth, height: video.videoHeight });
    },
    isRecording: () => samples !== null,
    /**
     * Frames processed in the last second. The trajectory comes from following the planted foot
     * frame to frame, so under ~20 fps (a slow phone, a hidden tab) it loses steps: show a warning.
     */
    fps: () => times.length,
    /** Turns the camera off and frees the model. */
    stop() {
      running = false;
      cancelAnimationFrame(frameId);
      stream.getTracks().forEach((t) => t.stop());
      video.srcObject = null;
      landmarker.close();
    },
  };
}

/** The frame's points through the One Euro filter, in MediaPipe's own shape ({ x, y, z, visibility }). */
function smoothed(filter, t, world, landmarks) {
  const out = filter.filter(
    t,
    world.map((p) => [p.x, p.y, p.z]),
    landmarks.map((p) => [p.x, p.y, p.z]),
  );
  return [
    out.world.map(([x, y, z], i) => ({ ...world[i], x, y, z })),
    out.image.map(([x, y, z], i) => ({ ...landmarks[i], x, y, z })),
  ];
}
