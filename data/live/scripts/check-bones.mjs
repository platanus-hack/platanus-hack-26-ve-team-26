// Tests the live bone guard (src/bones.js) without a browser: a synthetic person shows their arms
// across the image for two seconds (the guard learns their length), then raises both elbows toward
// the camera with the forearms up, read the way MediaPipe squashes depth (only 30% of it). The
// elbows must come back in front of the shoulders; an arm across the image must pass untouched; and
// noise on a straight arm must not add depth. Run: npm run check
import { createBoneGuard } from '../src/bones.js';

const failures = [];
const expect = (ok, what) => {
  console.log(`${ok ? 'ok' : 'FAIL'}: ${what}`);
  if (!ok) failures.push(what);
};

// MediaPipe world axes: x right of the image, y down, z away from the camera; hips at the origin.
const UPPER = 0.29;
const FORE = 0.26;
// arms: 'out' (T pose, across the image) or 'front' (elbows toward the camera at shoulder height,
// forearms up). depth: the share of the true depth MediaPipe reports.
function person(arms, depth = 1) {
  const p = Array.from({ length: 33 }, () => ({ x: 0, y: -0.6, z: -0.05, visibility: 0.9 }));
  const set = (i, x, y, z) => (p[i] = { x, y, z: z * depth, visibility: 0.9 });
  for (const [side, k] of [[1, 0], [-1, 1]]) {
    const sx = 0.18 * side;
    set(11 + k, sx, -0.5, 0);
    if (arms === 'out') {
      set(13 + k, sx + side * UPPER, -0.5, 0);
      set(15 + k, sx + side * (UPPER + FORE), -0.5, 0);
    } else {
      set(13 + k, sx, -0.5, -UPPER);
      set(15 + k, sx, -0.5 - FORE, -UPPER);
    }
    for (const i of [17, 19, 21]) set(i + k, p[15 + k].x, p[15 + k].y - 0.08, p[15 + k].z / depth);
  }
  p[23] = { x: 0.1, y: 0, z: 0, visibility: 0.9 };
  p[24] = { x: -0.1, y: 0, z: 0, visibility: 0.9 };
  return p;
}

{
  const guard = createBoneGuard();
  let t = 0;
  for (; t < 2; t += 1 / 30) guard.fix(person('out'), t);
  const lengths = guard.lengths();
  expect(lengths.every((l, i) => Math.abs(l - (i % 2 ? FORE : UPPER)) < 0.005), `learned lengths ${lengths.map((l) => l.toFixed(3)).join(', ')} m`);
  const out = guard.fix(person('out'), t).world;
  const truth = person('out');
  expect(out.every((q, i) => Math.abs(q.z - truth[i].z) < 1e-9), 'arms across the image: untouched');

  const { world, fixed } = guard.fix(person('front', 0.3), t + 1 / 30);
  expect(fixed > 0, `elbows toward the camera: ${fixed} segments fixed`);
  for (const [name, s, e] of [['left', 11, 13], ['right', 12, 14]]) {
    const ahead = world[s].z - world[e].z;
    expect(Math.abs(ahead - UPPER) < 0.02, `${name} elbow ${(100 * ahead).toFixed(1)} cm in front of the shoulder (the person's: ${(100 * UPPER).toFixed(0)}; MediaPipe said ${(100 * 0.3 * UPPER).toFixed(1)})`);
  }
}

{
  // A straight arm across the image whose length MediaPipe reads 3% short: within its own noise.
  const guard = createBoneGuard();
  let t = 0;
  for (; t < 2; t += 1 / 30) guard.fix(person('out'), t);
  const short = person('out').map((q, i) => ([13, 15, 17, 19, 21].includes(i) ? { ...q, x: 0.18 + (q.x - 0.18) * 0.97 } : q));
  const { world } = guard.fix(short, t);
  expect(Math.abs(world[13].z - world[11].z) < 0.005, `3% short arm keeps its depth (${(100 * (world[11].z - world[13].z)).toFixed(1)} cm)`);
}

if (failures.length) {
  console.error(`\ncheck-bones failed: ${failures.length}`);
  process.exit(1);
}
console.log('\ncheck-bones passed');
