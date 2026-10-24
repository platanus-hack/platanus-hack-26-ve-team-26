// Headless check of the fingers (src/fingers.js): hands in MediaPipe's 21 points are built from
// known Dex3 poses (open, fist, thumbs up, point, pinch), on both hands and turned anywhere in
// space, and the solver must give those poses back.
// Run: npm run check
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { createFingerSolver } from '../src/fingers.js';

const hands = JSON.parse(readFileSync(new URL('../models/dex3/hands.json', import.meta.url)));
const solver = createFingerSolver(hands);
// Within this of the pose the hand was built from, per joint: the Dex3's ranges run 60 to 100
// degrees, so 12 tells a bent finger from a straight one with room to spare.
const TOLERANCE_DEG = 12;
const FINGERTIP_M = 0.04; // how far past its last joint the fingertip point sits

const failures = [];
const expect = (ok, what) => {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${what}`);
  if (!ok) failures.push(what);
};

// A pose as flexion from 0 (open) to 1 (fully bent) per finger joint, turned into each side's
// signed angles: the Dex3's left and right fingers bend with opposite signs (hands.json ranges).
function anglesOf(side, pose) {
  const angles = new Map();
  for (const b of solver.joints(side)) {
    const short = b.name.replace(`${side}_hand_`, '').replace('_link', '');
    const [lo, hi] = b.range;
    const bend = pose[short] ?? 0;
    // The bending direction is the larger side of the range (thumb_0 swings both ways: by sign).
    const value = short === 'thumb_0' ? bend : Math.abs(hi) >= Math.abs(lo) ? bend * hi : bend * lo;
    angles.set(b.joint, THREE.MathUtils.clamp(value, lo, hi));
  }
  return angles;
}

// The person's 21 points for a Dex3 pose, in the hand frame, then turned and moved by `place`.
function personHand(side, angles, place) {
  const P = Array.from({ length: 21 }, () => new THREE.Vector3());
  const origin = (short) => {
    const b = solver.joints(side).find((j) => j.name === `${side}_hand_${short}_link`);
    // The body's origin: its parent's origin plus its offset turned by the parent.
    const parent = b.parent ? solver.joints(side).find((j) => j.name === b.parent) : null;
    if (!parent) return new THREE.Vector3(...b.pos);
    const pShort = parent.name.replace(`${side}_hand_`, '').replace('_link', '');
    return origin(pShort).add(solver.segment(side, angles, pShort).multiplyScalar(new THREE.Vector3(...b.pos).length()));
  };
  const finger = (base, mid, tipShort, points) => {
    const a = origin(base);
    const b = origin(mid);
    const tip = b.clone().addScaledVector(solver.segment(side, angles, tipShort), FINGERTIP_M);
    [P[points[0]], P[points[1]], P[points[2]], P[points[3]]] = [a, b, b.clone().lerp(tip, 0.5), tip];
  };
  P[0].set(0, 0, 0);
  finger('index_0', 'index_1', 'index_1', [5, 6, 7, 8]);
  // Middle, ring and pinky all where the Dex3's middle finger is: the knuckles' middle then lies on
  // the Dex3's x (fingers forward) and pinky to index on its z, as the solver reads a hand.
  finger('middle_0', 'middle_1', 'middle_1', [9, 10, 11, 12]);
  for (const k of [13, 17]) for (let i = 0; i < 4; i++) P[k + i].copy(P[9 + i]);
  P[1].copy(origin('thumb_0'));
  P[2].copy(origin('thumb_1'));
  P[3].copy(origin('thumb_2'));
  P[4].copy(P[3]).addScaledVector(solver.segment(side, angles, 'thumb_2'), FINGERTIP_M);
  return P.map((p) => p.applyQuaternion(place.turn).add(place.at));
}

const PLACES = [
  { name: 'as the hand frame', turn: new THREE.Quaternion(), at: new THREE.Vector3() },
  { name: 'turned and moved', turn: new THREE.Quaternion().setFromEuler(new THREE.Euler(0.7, -1.2, 2.1)), at: new THREE.Vector3(0.3, -0.2, 1.1) },
];
const POSES = {
  open: {},
  fist: { index_0: 1, index_1: 1, middle_0: 1, middle_1: 1, thumb_1: 0.6, thumb_2: 0.8 },
  'thumbs up': { index_0: 1, index_1: 1, middle_0: 1, middle_1: 1 },
  point: { index_0: 0, index_1: 0, middle_0: 1, middle_1: 1, thumb_1: 0.6, thumb_2: 0.8 },
  pinch: { index_0: 0.5, index_1: 0.4, middle_0: 0.2, thumb_0: 0.4, thumb_1: 0.5 },
};

for (const [name, pose] of Object.entries(POSES)) {
  console.log(name);
  for (const side of ['left', 'right']) {
    for (const place of PLACES) {
      const truth = anglesOf(side, pose);
      const got = solver.solve(side, personHand(side, truth, place));
      let worst = 0;
      let at = '';
      for (const [joint, value] of truth) {
        const off = (Math.abs((got.get(joint) ?? 0) - value) * 180) / Math.PI;
        if (off > worst) [worst, at] = [off, joint];
      }
      expect(worst < TOLERANCE_DEG, `${side}, ${place.name}: worst joint ${worst.toFixed(1)} degrees off (${at.replace(`${side}_hand_`, '')})`);
    }
  }
}

// A person's thumbs up is not a Dex3 pose: their thumb points past the index, across the hand,
// while the Dex3's sticks out of the palm and turns at most 60 degrees toward there.
console.log("a person's thumbs up (fist, thumb past the index)");
for (const side of ['left', 'right']) {
  const v = (x, y, z) => new THREE.Vector3(x, y, z);
  const palm = side === 'left' ? -1 : 1; // the palm faces -y on the left hand, +y on the right
  const P = Array.from({ length: 21 }, () => v(0, 0, 0));
  [P[5], P[9], P[13], P[17]] = [v(0.09, 0, 0.03), v(0.09, 0, 0), v(0.085, 0, -0.02), v(0.08, 0, -0.03)];
  for (const k of [5, 9, 13, 17]) {
    P[k + 1] = P[k].clone().add(v(0, palm * 0.04, 0)); // curled into the palm
    P[k + 3] = P[k + 1].clone().add(v(-0.03, 0, 0));
    P[k + 2] = P[k + 1].clone().lerp(P[k + 3], 0.5);
  }
  [P[1], P[2]] = [v(0.02, palm * 0.01, 0.025), v(0.045, palm * 0.01, 0.045)];
  P[3] = P[2].clone().add(v(0, 0, 0.035));
  P[4] = P[3].clone().add(v(0, 0, 0.03));
  solver.reset();
  const got = solver.solve(side, P);
  const thumbOff = (solver.segment(side, got, 'thumb_2').angleTo(v(0, 0, 1)) * 180) / Math.PI;
  const bent = ['index', 'middle'].every((f) => Math.abs(got.get(`${side}_hand_${f}_1_joint`)) > 1.2);
  // 30 degrees is where the Dex3's thumb runs out of range (measured); 40 leaves noise room.
  expect(thumbOff < 40 && bent, `${side}: thumb ${thumbOff.toFixed(0)} degrees from the person's, index and middle closed: ${bent}`);
}

if (failures.length) {
  console.error(`\ncheck-fingers failed: ${failures.length}`);
  process.exit(1);
}
console.log('\ncheck-fingers passed');
