// Headless check of the arm gestures a person makes in front of the live camera: each one is a
// synthetic person in MediaPipe's format, hands included (wrist, pinky, index and thumb points),
// and each says what the G1 must do with it. Palms that face forward or back, elbows raised to the
// sides or toward the camera, punches and waves (docs/investigacion/2026-10-24-brazos-humanos-en-vivo.md).
// Run: npm run check
import * as THREE from 'three';
import { loadG1Node } from './node-model.mjs';
import { createPoseTracker } from '../src/pose.js';
import { createRetargeter } from '../src/retarget.js';

const { mujoco, sim } = await loadG1Node();

// An adult of 1.75 m, the same as check-retarget.mjs. Robot axes: x toward the camera, y to the
// person's left (the image right), z up, hips at the origin.
const SEG = { shoulderHalf: 0.19, hipHalf: 0.1, upperArm: 0.29, foreArm: 0.26, thigh: 0.43, shin: 0.42, torso: 0.5 };
// A hand: the knuckles sit ~8 cm past the wrist and ~5 cm apart; the thumb's tip ~5 cm to the side.
const HAND = { knuckles: 0.08, halfWidth: 0.025, thumbOut: 0.045, thumbAlong: 0.04 };
const v = (x, y, z) => new THREE.Vector3(x, y, z);
const FWD = v(1, 0, 0);
const UP = v(0, 0, 1);
const DOWN = v(0, 0, -1);
const OUT = { left: 1, right: -1 }; // the person's left is +y

/**
 * @param arms { left?, right? }: { upper, fore, palm } unit vectors in robot axes: where the upper
 *   arm and forearm point, and where the palm faces (any vector; its part across the forearm counts)
 * @returns 33 MediaPipe world landmarks (y down, z away from the camera)
 */
function person(arms = {}) {
  const P = {};
  const s = SEG;
  P[0] = v(0.03, 0, s.torso + 0.2);
  P[23] = v(0, s.hipHalf, 0);
  P[24] = v(0, -s.hipHalf, 0);
  P[25] = v(0, s.hipHalf, -s.thigh);
  P[26] = v(0, -s.hipHalf, -s.thigh);
  P[27] = v(0, s.hipHalf, -s.thigh - s.shin);
  P[28] = v(0, -s.hipHalf, -s.thigh - s.shin);
  for (const side of ['left', 'right']) {
    const k = side === 'left' ? 0 : 1;
    const out = OUT[side];
    // Arms hang with the palms toward the thighs unless told otherwise.
    const { upper = DOWN, fore = DOWN, palm = v(0, -out, 0) } = arms[side] ?? {};
    const shoulder = v(0, out * s.shoulderHalf, s.torso);
    const elbow = shoulder.clone().addScaledVector(upper.clone().normalize(), s.upperArm);
    const f = fore.clone().normalize();
    const wrist = elbow.clone().addScaledVector(f, s.foreArm);
    // Across the hand, from the pinky to the index: (palm x forearm), on the left hand.
    const n = palm.clone().addScaledVector(f, -palm.dot(f)).normalize();
    const across = n.clone().cross(f).multiplyScalar(out);
    P[11 + k] = shoulder;
    P[13 + k] = elbow;
    P[15 + k] = wrist;
    P[17 + k] = wrist.clone().addScaledVector(f, HAND.knuckles).addScaledVector(across, -HAND.halfWidth); // pinky
    P[19 + k] = wrist.clone().addScaledVector(f, HAND.knuckles).addScaledVector(across, HAND.halfWidth); // index
    P[21 + k] = wrist.clone().addScaledVector(f, HAND.thumbAlong).addScaledVector(across, HAND.thumbOut); // thumb
  }
  return Array.from({ length: 33 }, (_, i) => {
    const p = P[i];
    // Robot axes to MediaPipe's: x = robot y, y = -robot z, z = -robot x.
    return p ? { x: p.y, y: -p.z, z: -p.x, visibility: 0.99 } : { x: 0, y: 0, z: 0, visibility: 0 };
  });
}

// A few frames, like a camera, so the solve settles from the previous one.
function run(world) {
  const tracker = createPoseTracker({ smooth: false });
  const retargeter = createRetargeter(mujoco, sim.model, { mirror: false, live: true });
  let out;
  for (let f = 0; f < 6; f++) out = retargeter.solve(tracker.update(world, world, f / 30));
  retargeter.delete();
  sim.puppet(out.qpos);
  return out;
}

const at = (name) => v(...sim.bodyPosition(name));
// The G1's forearm, elbow link to wrist roll link (~10 cm): "the hand under the elbow" means most of it.
sim.reset();
const FOREARM = at('left_elbow_link').distanceTo(at('left_wrist_roll_link'));
const MOST_OF_FOREARM = 0.75 * FOREARM;
// The robot's hand: fingers along the wrist_yaw_link's +x; its palm faces along -y on the left
// hand and +y on the right (in the stand pose both palms face the thighs; measured).
function hand(side) {
  const id = sim.id('BODY', `${side}_wrist_yaw_link`);
  const m = sim.data.xmat.subarray(9 * id, 9 * id + 9);
  return { fingers: v(m[0], m[3], m[6]), palm: v(m[1], m[4], m[7]).multiplyScalar(-OUT[side]) };
}
const degrees = (a, b) => (Math.acos(THREE.MathUtils.clamp(a.dot(b) / a.length() / b.length(), -1, 1)) * 180) / Math.PI;

const failures = [];
const expect = (ok, what) => {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${what}`);
  if (!ok) failures.push(what);
};
// Within this of where the person's palm faces: a palm turned forward or back is ~90 degrees off
// the stand pose, so 45 tells the three apart.
const PALM_TOLERANCE = 45;

// palm: a vector, or (side) => vector for one that differs between the hands.
function palms(name, palm, arms) {
  console.log(name);
  const of = (side) => (typeof palm === 'function' ? palm(side) : palm);
  run(person({ left: { palm: of('left'), ...arms }, right: { palm: of('right'), ...arms } }));
  for (const side of ['left', 'right']) {
    const off = degrees(hand(side).palm, of(side));
    expect(off < PALM_TOLERANCE, `${side} palm ${off.toFixed(0)} degrees from the person's`);
  }
}

palms('arms down, palms toward the thighs', (side) => v(0, -OUT[side], 0), {});
palms('arms down, palms forward (toward the camera)', FWD, {});
palms('arms down, palms back', v(-1, 0, 0), {});
palms('arms straight forward, palms down', DOWN, { upper: FWD, fore: FWD });
palms('arms straight forward, palms up', UP, { upper: FWD, fore: FWD });

console.log('arms down, palms forward, with 2 cm of depth noise on every point (MediaPipe\'s weakest axis)');
{
  // A fixed sequence, so the check gives the same answer every run.
  let seed = 7;
  const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
  let worst = 0;
  for (let trial = 0; trial < 20; trial++) {
    const world = person({ left: { palm: FWD }, right: { palm: FWD } }).map((p) => ({ ...p, z: p.z + 0.02 * random() }));
    run(world);
    for (const side of ['left', 'right']) worst = Math.max(worst, degrees(hand(side).palm, FWD));
  }
  expect(worst < PALM_TOLERANCE, `worst palm of 20 noisy frames ${worst.toFixed(0)} degrees from the camera`);
}

console.log('elbows up to the sides, hands hanging (chicken wings)');
{
  const wings = (side) => ({ upper: v(0, OUT[side], 0), fore: DOWN });
  run(person({ left: wings('left'), right: wings('right') }));
  for (const side of ['left', 'right']) {
    const elbow = at(`${side}_elbow_link`);
    const shoulder = at(`${side}_shoulder_pitch_link`);
    const wrist = at(`${side}_wrist_roll_link`);
    // Level with the shoulder within 6 cm, the hand under the elbow by most of the forearm.
    expect(Math.abs(elbow.z - shoulder.z) < 0.06, `${side} elbow at shoulder height (off by ${(100 * (elbow.z - shoulder.z)).toFixed(1)} cm)`);
    expect(elbow.z - wrist.z > MOST_OF_FOREARM, `${side} hand ${(100 * (elbow.z - wrist.z)).toFixed(1)} cm under the elbow`);
  }
}

console.log('elbows raised toward the camera, forearms up (hands at the face)');
{
  const front = (side) => ({ upper: v(1, 0.2 * OUT[side], 0), fore: UP });
  run(person({ left: front('left'), right: front('right') }));
  for (const side of ['left', 'right']) {
    const elbow = at(`${side}_elbow_link`);
    const shoulder = at(`${side}_shoulder_pitch_link`);
    const wrist = at(`${side}_wrist_roll_link`);
    expect(Math.abs(elbow.z - shoulder.z) < 0.06, `${side} elbow at shoulder height (off by ${(100 * (elbow.z - shoulder.z)).toFixed(1)} cm)`);
    expect(elbow.x - shoulder.x > 0.1, `${side} elbow ${(100 * (elbow.x - shoulder.x)).toFixed(1)} cm in front of the shoulder`);
    expect(wrist.z - elbow.z > MOST_OF_FOREARM, `${side} hand ${(100 * (wrist.z - elbow.z)).toFixed(1)} cm over the elbow`);
  }
}

console.log('punch: right arm straight forward');
{
  run(person({ right: { upper: FWD, fore: FWD, palm: DOWN } }));
  const shoulder = at('right_shoulder_pitch_link');
  const wrist = at('right_wrist_roll_link');
  expect(wrist.x - shoulder.x > 0.24 && Math.abs(wrist.z - shoulder.z) < 0.06, `right fist ${(100 * (wrist.x - shoulder.x)).toFixed(0)} cm forward, ${(100 * (wrist.z - shoulder.z)).toFixed(1)} cm off shoulder height`);
  expect(at('left_shoulder_pitch_link').z - at('left_wrist_roll_link').z > 0.2, 'left arm still hangs');
}

console.log('wave: left upper arm out, forearm up, palm toward the camera');
{
  run(person({ left: { upper: v(0, 1, 0), fore: UP, palm: FWD } }));
  const elbow = at('left_elbow_link');
  const wrist = at('left_wrist_roll_link');
  expect(wrist.z - elbow.z > MOST_OF_FOREARM, `hand ${(100 * (wrist.z - elbow.z)).toFixed(1)} cm over the elbow`);
  const off = degrees(hand('left').palm, FWD);
  expect(off < PALM_TOLERANCE, `palm ${off.toFixed(0)} degrees from the camera`);
}

console.log('hand model (21 points a hand) wins over the pose\'s 4 hand points');
{
  // The pose's hand points say palms back; the hand model says palms forward: the model is steadier.
  const back = person({ left: { palm: v(-1, 0, 0) }, right: { palm: v(-1, 0, 0) } });
  const forward = person({ left: { palm: FWD }, right: { palm: FWD } });
  // The hand model's points for each hand: wrist (0), index knuckle (5), pinky knuckle (17), around
  // the hand's own center like MediaPipe's; the rest unused here.
  const handModel = (k) => {
    const pts = Array.from({ length: 21 }, () => ({ x: 0, y: 0, z: 0 }));
    const c = forward[15 + k];
    const at = (i) => ({ x: forward[i].x - c.x, y: forward[i].y - c.y, z: forward[i].z - c.z });
    pts[0] = at(15 + k);
    pts[5] = at(19 + k);
    pts[17] = at(17 + k);
    return pts;
  };
  const tracker = createPoseTracker({ smooth: false });
  const retargeter = createRetargeter(mujoco, sim.model, { mirror: false, live: true });
  let out;
  for (let f = 0; f < 6; f++) out = retargeter.solve(tracker.update(back, back, f / 30), { hands: { left: handModel(0), right: handModel(1) } });
  retargeter.delete();
  sim.puppet(out.qpos);
  for (const side of ['left', 'right']) {
    const off = degrees(hand(side).palm, FWD);
    expect(off < PALM_TOLERANCE, `${side} palm ${off.toFixed(0)} degrees from the camera, as the hand model says`);
  }
}

console.log('facing the camera, right arm hidden behind the back: it is not mirrored from the left');
{
  const tracker = createPoseTracker({ smooth: false });
  const retargeter = createRetargeter(mujoco, sim.model, { mirror: false, live: true });
  // The left arm swings forward; the right one was last seen hanging, then goes out of sight.
  const swing = person({ left: { upper: v(1, 0, -1), fore: v(1, 0, -1) } });
  let out;
  for (let f = 0; f < 6; f++) out = retargeter.solve(tracker.update(person(), person(), f / 30));
  const hidden = swing.map((p, i) => ([14, 16, 18, 20, 22].includes(i) ? { ...p, visibility: 0 } : p));
  for (let f = 6; f < 12; f++) out = retargeter.solve(tracker.update(hidden, hidden, f / 30));
  retargeter.delete();
  sim.puppet(out.qpos);
  const shoulder = at('right_shoulder_pitch_link');
  const wrist = at('right_wrist_roll_link');
  expect(!out.mirroredArm, 'mirroredArm is false');
  expect(Math.abs(wrist.x - shoulder.x) < 0.06, `right hand stays where it was seen (${(100 * (wrist.x - shoulder.x)).toFixed(1)} cm forward of the shoulder)`);
}

if (failures.length) {
  console.error(`\ncheck-gestures failed: ${failures.length}`);
  process.exit(1);
}
console.log('\ncheck-gestures passed');
