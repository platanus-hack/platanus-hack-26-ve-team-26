// Tests buildPoseClip without a browser: a synthetic person walks across a fixed camera at a known
// speed, seen at uneven webcam frame times, with a few lost frames, one mirrored misread and a first
// frame whose camera fit lands meters away (the body entering the shot).
// The clip must follow the contract and recover the speed. Then the smoothing: the Savitzky-Golay
// port must keep a polynomial exactly (as data/smooth.py does), and the live One Euro filter must
// remove most of the shake of a noisy walk without shortening the step. Run: npm run check
import { PoseFilter } from '../src/oneeuro.js';
import { buildPoseClip, savgol } from '../src/poseclip.js';

const SPEED = 1.2; // m/s, a normal walk
const STEP_S = 0.5; // each foot is planted half a gait cycle
const DEPTH = 4; // m from the camera
const W = 1280;
const H = 720;
const F = W / (2 * Math.tan((65 * Math.PI) / 360)); // same field of view the module assumes

function pose(t) {
  // Camera space, MediaPipe axes: x right, y down, z away. Hips at x = -2 + SPEED t.
  const hip = [-2 + SPEED * t, 0, DEPTH];
  const joints = Array.from({ length: 33 }, () => [0, -0.6, 0]); // face points near the head
  const set = (i, p) => (joints[i] = p);
  set(11, [0, -0.5, -0.18]); set(12, [0, -0.5, 0.18]); // shoulders (person faces +x, profile)
  set(13, [0, -0.25, -0.2]); set(14, [0, -0.25, 0.2]);
  set(15, [0.05, 0, -0.2]); set(16, [0.05, 0, 0.2]);
  set(23, [0, 0, -0.1]); set(24, [0, 0, 0.1]);
  for (const [side, offset] of [[0, 0], [1, 1]]) {
    // Each foot: planted for a step (fixed on the ground), then swings forward at twice the speed.
    const phase = (t / STEP_S + offset) % 2;
    const cycle = Math.floor(t / STEP_S + offset) - (phase >= 1 ? 1 : 0);
    const planted = (cycle * STEP_S - offset * STEP_S) * SPEED + SPEED * STEP_S;
    const footX = phase < 1 ? planted : planted + (phase - 1) * 2 * SPEED * STEP_S;
    const lift = phase < 1 ? 0 : 0.1 * Math.sin((phase - 1) * Math.PI);
    const z = side === 0 ? -0.1 : 0.1;
    const rel = footX - 2 - hip[0];
    set(25 + side, [rel / 2, 0.45, z]);
    set(27 + side, [rel, 0.85 - lift, z]);
    set(29 + side, [rel - 0.05, 0.9 - lift, z]);
    set(31 + side, [rel + 0.15, 0.9 - lift, z]);
  }
  const image = joints.map((p) => {
    const c = [p[0] + hip[0], p[1] + hip[1], p[2] + hip[2]];
    return [(F * c[0]) / c[2] + W / 2, (F * c[1]) / c[2] + H / 2, 0.9];
  });
  return { world: joints, image };
}

const samples = [];
let t = 0;
for (let k = 0; t < 4; k++) {
  t += 1 / 30 + (k % 3 === 0 ? 0.008 : -0.004); // uneven webcam timing
  const s = { t, ...pose(t) };
  if (k === 0) samples.push({ ...s, image: s.image.map(([x, y, v]) => [(x - W / 2) / 2 + W / 2, (y - H / 2) / 2 + H / 2, v]) }); // looks twice as far
  else if (k >= 40 && k < 44) samples.push({ t, valid: false }); // body lost for a few frames
  else if (k === 60) samples.push({ ...s, world: s.world.map(([x, y, z]) => [-x, y, -z]) }); // mirrored misread
  else samples.push(s);
}

const clip = buildPoseClip(samples, { width: W, height: H, id: 'clip_check_01' });
const fail = [];
const check = (ok, msg) => ok || fail.push(msg);

check(clip.source === 'camera' && clip.source_file === null, 'source must be camera with no file');
check(clip.fps === 30 && clip.skeleton === 'mediapipe33' && clip.units === 'm' && clip.origin === 'hips', 'header');
check(clip.frames.every((f) => f.joints.length === 33 && f.joints.every((j) => j.length === 4)), '33 joints of 4 values');
check(clip.frames.every((f, k) => Math.abs(f.t - k / 30) < 1e-3), 'frames every 1/30 s');
const hips = (f) => [0, 1, 2].map((a) => (f.joints[23][a] + f.joints[24][a]) / 2);
check(hips(clip.frames[0]).every((v) => Math.abs(v) < 1e-3), 'origin at the hips of the first frame');
const last = clip.frames.at(-1);
const speed = Math.hypot(hips(last)[0], hips(last)[2]) / last.t;
check(Math.abs(speed - SPEED) / SPEED < 0.1, `speed ${speed.toFixed(2)} m/s, expected ${SPEED}`);
check(hips(last)[0] > 0, 'walking right moves +x');
const depth = Math.max(...clip.frames.map((f) => Math.abs(hips(f)[2])));
check(depth < 0.3, `walking across keeps the depth: hips up to ${depth.toFixed(2)} m toward the camera`);
const head = clip.frames[0].joints[0][1];
check(head > 0.4, `y up: the head is ${head.toFixed(2)} m above the hips`);
check(clip.quality.valid_ratio > 0.9 && clip.quality.valid_ratio < 1, `valid_ratio ${clip.quality.valid_ratio}`);

// Savitzky-Golay keeps a polynomial of its order exactly, edges included.
const quad = Array.from({ length: 25 }, (_, k) => [k * k, 3 * k - 1, 0.5 * k * k - k]);
const sgErr = Math.max(...savgol(quad, 19, 2).flatMap((r, k) => r.map((v, a) => Math.abs(v - quad[k][a]))));
check(sgErr < 1e-6, `savgol changes a quadratic by ${sgErr}`);

// One Euro on the synthetic walk at 30 fps with MediaPipe-like noise (2 cm per point per frame,
// deterministic so the check is repeatable).
let seed = 1;
const noise = () => ((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5) * 0.04 * Math.sqrt(3);
const filter = new PoseFilter();
const truth = [];
const raw = [];
const smoothed = [];
for (let k = 0; k < 120; k++) {
  const tk = k / 30;
  const w = pose(tk).world;
  const noisy = w.map((p) => p.map((v) => v + noise()));
  truth.push(w);
  raw.push(noisy);
  smoothed.push(filter.filter(tk, noisy).world);
}
const LEGS = [25, 26, 27, 28];
const accP95 = (xs) => {
  const acc = [];
  for (let k = 2; k < xs.length; k++)
    for (const i of LEGS) acc.push(Math.hypot(...[0, 1, 2].map((a) => (xs[k][i][a] - 2 * xs[k - 1][i][a] + xs[k - 2][i][a]) * 900)));
  return acc.sort((x, y) => x - y)[Math.floor(acc.length * 0.95)];
};
const accRaw = accP95(raw);
const accSmooth = accP95(smoothed);
check(accSmooth < accRaw / 3, `One Euro: p95 leg acceleration ${accRaw.toFixed(0)} -> ${accSmooth.toFixed(0)} m/s², expected under a third`);
// The step keeps its length: how far the ankles swing forward and back relative to the hips. The
// synthetic foot reverses instantly (real feet take a few frames), so a causal filter cuts its
// corners more than on a real walk: 88% here, 94% on the cached walk of data/clips. Under 85% fails.
const stride = (xs) => Math.max(...xs.slice(10).map((f) => f[27][0])) - Math.min(...xs.slice(10).map((f) => f[27][0]));
const strideRatio = stride(smoothed) / stride(truth);
check(strideRatio > 0.85 && strideRatio < 1.05, `One Euro changes the stride to ${(100 * strideRatio).toFixed(0)}%`);

if (fail.length) {
  console.error(`check failed:\n- ${fail.join('\n- ')}`);
  process.exit(1);
}
console.log(
  `check ok: ${clip.frames.length} frames, ${speed.toFixed(2)} m/s (expected ${SPEED}), valid ${clip.quality.valid_ratio}; ` +
    `One Euro leg acceleration p95 ${accRaw.toFixed(0)} -> ${accSmooth.toFixed(0)} m/s², stride ${(100 * strideRatio).toFixed(0)}%`,
);
