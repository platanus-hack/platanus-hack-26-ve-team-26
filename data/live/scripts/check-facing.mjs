// Tests the live facing guard (src/facing.js) without a browser: a synthetic person facing the
// camera with the left arm raised, with a few frames read as MediaPipe misreads a back (mirrored
// through the image plane, left and right swapped), must come out as the true pose; and a real
// turn around, slow and through profile, must pass untouched. Run: npm run check
import { createFacingGuard, heading } from '../src/facing.js';

const failures = [];
const expect = (ok, what) => {
  console.log(`${ok ? 'ok' : 'FAIL'}: ${what}`);
  if (!ok) failures.push(what);
};

// MediaPipe world axes: x right of the image, y down, z away from the camera; hips at the origin.
// The person faces the camera (toward -z), turned by `yaw` about the vertical; the left wrist is
// up and forward, the right one hangs.
function person(yaw) {
  const local = Array.from({ length: 33 }, () => [0, -0.6, -0.05]); // face points near the head
  const set = (i, p) => (local[i] = p);
  // Facing the camera, the person's left is the image's right (+x).
  set(11, [0.18, -0.5, 0]); set(12, [-0.18, -0.5, 0]);
  set(13, [0.2, -0.75, -0.1]); set(14, [-0.2, -0.25, 0]);
  set(15, [0.2, -1.0, -0.25]); set(16, [-0.2, 0, 0]);
  set(23, [0.1, 0, 0]); set(24, [-0.1, 0, 0]);
  set(25, [0.1, 0.45, 0]); set(26, [-0.1, 0.45, 0]);
  set(27, [0.1, 0.85, 0]); set(28, [-0.1, 0.85, 0]);
  const [c, s] = [Math.cos(yaw), Math.sin(yaw)];
  return local.map(([x, y, z]) => ({ x: c * x + s * z, y, z: -s * x + c * z, visibility: 0.9 }));
}
// How MediaPipe misreads it: the mirror through the image plane, with the labels of the mirrored
// body (its left and right swapped).
const PAIRS = [[1, 4], [2, 5], [3, 6], [7, 8], [9, 10], [11, 12], [13, 14], [15, 16], [17, 18], [19, 20], [21, 22], [23, 24], [25, 26], [27, 28], [29, 30], [31, 32]];
function misread(points) {
  const out = points.map((p) => ({ ...p, z: -p.z }));
  for (const [a, b] of PAIRS) [out[a], out[b]] = [out[b], out[a]];
  return out;
}
const worst = (a, b) => Math.max(...a.map((p, i) => Math.hypot(p.x - b[i].x, p.y - b[i].y, p.z - b[i].z)));

{
  const guard = createFacingGuard();
  const truth = person(0.3); // a little turned, as people stand
  let fixed = 0;
  let error = 0;
  for (let k = 0; k < 60; k++) {
    const wrong = k >= 30 && k < 34; // four frames (0.13 s) misread
    const frame = wrong ? misread(truth) : truth;
    const out = guard.fix(frame, frame, k / 30);
    if (out.fixed) fixed += 1;
    error = Math.max(error, worst(out.world, truth));
  }
  expect(fixed === 4, `the 4 misread frames are put right (${fixed})`);
  expect(error < 1e-9, `every frame comes out as the true pose (worst ${(100 * error).toFixed(1)} cm off)`);
}

{
  // A real turn around: 180 degrees in 1.5 s, at 30 fps.
  const guard = createFacingGuard();
  let fixed = 0;
  for (let k = 0; k < 90; k++) {
    const yaw = Math.min(1, Math.max(0, (k - 20) / 45)) * Math.PI;
    const frame = person(yaw);
    if (guard.fix(frame, frame, k / 30).fixed) fixed += 1;
  }
  const [start, end] = [heading(person(0)), heading(person(Math.PI))];
  const turned = start[0] * end[0] + start[1] * end[1];
  expect(fixed === 0 && turned < -0.99, `a real turn around is left alone (${fixed} frames touched) and ends facing the other way (${turned.toFixed(2)})`);
}

if (failures.length) process.exit(1);
console.log('check-facing ok');
