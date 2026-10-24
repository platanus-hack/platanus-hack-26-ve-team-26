// Headless check of the camera retargeting: synthetic people in MediaPipe's own format go in,
// G1 joint angles come out, and each answer is known in advance.
// Run: npm run check
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import loadMujoco from '@mujoco/mujoco';
import { Simulation } from '../src/sim.js';
import { createPoseTracker } from '../src/pose.js';
import { createRetargeter } from '../src/retarget.js';

const MODEL_DIR = new URL('../models/unitree_g1/', import.meta.url).pathname;
// Above this a limb ended up farther than 8 cm from where the person put it (Sombra's REACH_TOLERANCE).
const REACH_TOLERANCE = 0.08;
// One solve must fit comfortably in a camera frame (33 ms at 30 fps), next to MediaPipe and drawing.
const MAX_MS_PER_SOLVE = 12;
const STAND_PELVIS_Z = 0.793; // "stand" keyframe, with the feet on the floor

function readTree(dir) {
  const files = {};
  for (const entry of readdirSync(dir, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const path = join(entry.parentPath, entry.name);
    files[relative(dir, path)] = new Uint8Array(readFileSync(path));
  }
  return files;
}

// A person facing the camera, in "natural" axes: x to the image right (their left), y up, z toward
// the camera, hips at the origin. Segment lengths of an adult of 1.75 m. `pose` overrides joints.
const SEG = { shoulderHalf: 0.19, hipHalf: 0.1, upperArm: 0.29, foreArm: 0.26, thigh: 0.43, shin: 0.42, torso: 0.5 };
function person(overrides = {}, { yaw = 0, legsVisible = true } = {}) {
  const P = {};
  const set = (i, x, y, z) => (P[i] = [x, y, z]);
  const s = SEG;
  set(0, 0, s.torso + 0.2, 0.03); // nose
  set(11, s.shoulderHalf, s.torso, 0); // left shoulder (image right)
  set(12, -s.shoulderHalf, s.torso, 0);
  set(13, s.shoulderHalf, s.torso - s.upperArm, 0); // arms hang
  set(14, -s.shoulderHalf, s.torso - s.upperArm, 0);
  set(15, s.shoulderHalf, s.torso - s.upperArm - s.foreArm, 0);
  set(16, -s.shoulderHalf, s.torso - s.upperArm - s.foreArm, 0);
  set(23, s.hipHalf, 0, 0);
  set(24, -s.hipHalf, 0, 0);
  set(25, s.hipHalf, -s.thigh, 0);
  set(26, -s.hipHalf, -s.thigh, 0);
  set(27, s.hipHalf, -s.thigh - s.shin, 0);
  set(28, -s.hipHalf, -s.thigh - s.shin, 0);
  Object.assign(P, overrides);
  const c = Math.cos(yaw);
  const sn = Math.sin(yaw);
  const world = Array.from({ length: 33 }, (_, i) => {
    const [x, y, z] = P[i] ?? [0, 0, 0];
    // Turn about the vertical axis, then to MediaPipe's axes: y down, z away from the camera.
    const xr = c * x + sn * z;
    const zr = -sn * x + c * z;
    const seen = P[i] !== undefined && (legsVisible || ![25, 26, 27, 28].includes(i));
    return { x: xr, y: -y, z: -zr, visibility: seen ? 0.99 : 0 };
  });
  return world;
}

const mujoco = await loadMujoco();
const sim = new Simulation(mujoco, readTree(MODEL_DIR), 'scene.xml', 'stand');

// Each case runs for a few frames so the One Euro filter settles, like a camera would.
function run(world, options) {
  const tracker = createPoseTracker();
  const retargeter = createRetargeter(mujoco, sim.model, options);
  let out;
  for (let f = 0; f < 6; f++) out = retargeter.solve(tracker.update(world, world, f / 30));
  return { ...out, retargeter };
}

const j = (name) => sim.model.jnt_qposadr[sim.id('JOINT', name)];
const failures = [];
const expect = (ok, what) => {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${what}`);
  if (!ok) failures.push(what);
};
// World position of a body when the robot is placed at qpos.
function bodyAt(qpos, name) {
  sim.puppet(qpos);
  return sim.bodyPosition(name);
}
// How far a G1 arm reaches from its shoulder joint to the wrist link (the arm is short: about 29 cm).
// An arm "out" or "down" must cover most of it.
const ARM_REACH = (() => {
  const key = sim.model.key('stand').id;
  const stand = sim.model.key_qpos.slice(key * sim.model.nq, (key + 1) * sim.model.nq);
  const d = (a, b) => Math.hypot(...a.map((v, i) => v - b[i]));
  const at = (n) => bodyAt(stand, n);
  return d(at('left_shoulder_pitch_link'), at('left_elbow_link')) + d(at('left_elbow_link'), at('left_wrist_roll_link'));
})();
const MOST_OF_THE_ARM = 0.8 * ARM_REACH;
console.log(`G1 arm reach: ${ARM_REACH.toFixed(3)} m`);

console.log('standing, arms down, facing the camera');
{
  const r = run(person(), { mirror: false });
  expect(r.tracked, 'tracked');
  expect(r.residual < REACH_TOLERANCE, `limbs reach their targets (${(r.residual * 100).toFixed(1)} cm)`);
  expect(Math.abs(r.qpos[2] - STAND_PELVIS_Z) < 0.03, `feet on the floor: pelvis at ${r.qpos[2].toFixed(3)} m`);
  expect(Math.abs(r.qpos[j('waist_yaw_joint')]) + Math.abs(r.qpos[j('waist_roll_joint')]) < 0.1, 'waist straight');
  expect(Math.abs(r.qpos[6]) < 0.05, 'pelvis faces forward (heading 0)');
  const drop = bodyAt(r.qpos, 'left_shoulder_pitch_link')[2] - bodyAt(r.qpos, 'left_wrist_roll_link')[2];
  expect(drop > MOST_OF_THE_ARM, `left wrist hangs ${drop.toFixed(2)} m below the shoulder`);
}

console.log("person's right arm out to the side (T), copied as is");
{
  const s = SEG;
  const world = person({ 14: [-s.shoulderHalf - s.upperArm, s.torso, 0], 16: [-s.shoulderHalf - s.upperArm - s.foreArm, s.torso, 0] });
  const r = run(world, { mirror: false });
  const wrist = bodyAt(r.qpos, 'right_wrist_roll_link');
  const shoulder = bodyAt(r.qpos, 'right_shoulder_pitch_link');
  expect(r.residual < REACH_TOLERANCE, `reaches (${(r.residual * 100).toFixed(1)} cm)`);
  expect(shoulder[1] - wrist[1] > MOST_OF_THE_ARM, `robot's right wrist is ${(shoulder[1] - wrist[1]).toFixed(2)} m out to its right`);
  expect(Math.abs(wrist[2] - shoulder[2]) < 0.06, `at shoulder height (off by ${Math.abs(wrist[2] - shoulder[2]).toFixed(2)} m)`);
  expect(shoulder[2] - bodyAt(r.qpos, 'left_wrist_roll_link')[2] > MOST_OF_THE_ARM, 'left arm still hangs');
}

console.log('same T arm in mirror mode: the other arm goes up, like a reflection');
{
  const s = SEG;
  const world = person({ 14: [-s.shoulderHalf - s.upperArm, s.torso, 0], 16: [-s.shoulderHalf - s.upperArm - s.foreArm, s.torso, 0] });
  const r = run(world, { mirror: true });
  const wrist = bodyAt(r.qpos, 'left_wrist_roll_link');
  const shoulder = bodyAt(r.qpos, 'left_shoulder_pitch_link');
  expect(wrist[1] - shoulder[1] > MOST_OF_THE_ARM && Math.abs(wrist[2] - shoulder[2]) < 0.06, "robot's left arm out to its left at shoulder height");
  expect(bodyAt(r.qpos, 'right_shoulder_pitch_link')[2] - bodyAt(r.qpos, 'right_wrist_roll_link')[2] > MOST_OF_THE_ARM, 'right arm hangs');
}

console.log("person's left knee raised in front (hip at 90 degrees)");
{
  const s = SEG;
  const world = person({ 25: [s.hipHalf, 0, s.thigh], 27: [s.hipHalf, -s.shin, s.thigh] });
  const r = run(world, { mirror: false });
  const knee = bodyAt(r.qpos, 'left_knee_link');
  const hip = bodyAt(r.qpos, 'left_hip_pitch_link');
  expect(r.residual < REACH_TOLERANCE, `reaches (${(r.residual * 100).toFixed(1)} cm)`);
  expect(knee[0] - hip[0] > 0.3 && Math.abs(knee[2] - hip[2]) < 0.1, `knee ${(knee[0] - hip[0]).toFixed(2)} m in front of the hip, at its height`);
  expect(Math.abs(r.qpos[2] - STAND_PELVIS_Z) < 0.03, `still on the standing foot: pelvis at ${r.qpos[2].toFixed(3)} m`);
}

console.log('person seen from the side, facing the right of the image');
{
  const r = run(person({}, { yaw: Math.PI / 2 }), { mirror: false });
  // Facing the image right = the robot's +y (left) axis: a quarter turn counter-clockwise.
  const yaw = 2 * Math.atan2(r.qpos[6], r.qpos[3]);
  expect(Math.abs(yaw - Math.PI / 2) < 0.15, `pelvis heading ${((yaw * 180) / Math.PI).toFixed(0)} degrees (expected 90)`);
  expect(r.residual < REACH_TOLERANCE, `reaches (${(r.residual * 100).toFixed(1)} cm)`);
}

console.log('sitting at a desk: legs out of frame stay in the stand pose');
{
  const r = run(person({}, { legsVisible: false }), { mirror: true });
  const stand = sim.model.key_qpos.slice(sim.model.key('stand').id * sim.model.nq, (sim.model.key('stand').id + 1) * sim.model.nq);
  const legs = ['left_hip_pitch_joint', 'left_knee_joint', 'right_hip_pitch_joint', 'right_knee_joint'];
  expect(r.tracked && legs.every((n) => Math.abs(r.qpos[j(n)] - stand[j(n)]) < 1e-6), 'leg joints untouched');
  expect(r.residual < REACH_TOLERANCE, `arms still reach (${(r.residual * 100).toFixed(1)} cm)`);
}

console.log('nobody in frame: the previous pose is kept');
{
  const tracker = createPoseTracker();
  const retargeter = createRetargeter(mujoco, sim.model);
  const none = person().map((l) => ({ ...l, visibility: 0 }));
  const r = retargeter.solve(tracker.update(none, none, 0));
  expect(!r.tracked, 'tracked is false');
}

console.log("Juan's real walking clip (MediaPipe on a video of someone walking in profile)");
{
  const clip = JSON.parse(readFileSync(new URL('../../data/clips/clip_2026-10-23_caminar-perfil_01.json', import.meta.url)));
  const tracker = createPoseTracker();
  const retargeter = createRetargeter(mujoco, sim.model, { mirror: false });
  const rows = clip.frames.map((f) => {
    // PoseClip axes (y up, z toward the camera) back to MediaPipe's (y down, z away).
    const world = f.joints.map(([x, y, z, v]) => ({ x, y: -y, z: -z, visibility: v }));
    return retargeter.solve(tracker.update(world, world, f.t));
  });
  const median = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
  const heading = rows.map((r) => (2 * Math.atan2(r.qpos[6], r.qpos[3]) * 180) / Math.PI);
  const knee = rows.map((r) => r.qpos[j('left_knee_joint')]);
  const reached = rows.filter((r) => r.residual < REACH_TOLERANCE).length / rows.length;
  expect(rows.every((r) => r.tracked), `all ${rows.length} frames tracked`);
  // The walker faces the right of the image, which is the robot's +y: a heading of +90 degrees.
  expect(Math.abs(median(heading) - 90) < 15, `median heading ${median(heading).toFixed(0)} degrees (expected 90)`);
  expect(reached >= 0.95, `${(reached * 100).toFixed(0)}% of frames within ${REACH_TOLERANCE * 100} cm`);
  // A walking knee goes from straight to well bent (it reached 1.28 rad when this was written).
  expect(Math.max(...knee) - Math.min(...knee) > 1, `left knee swings ${(Math.max(...knee) - Math.min(...knee)).toFixed(2)} rad`);
}

console.log('speed');
{
  const tracker = createPoseTracker();
  const retargeter = createRetargeter(mujoco, sim.model);
  const s = SEG;
  const frames = 200;
  const start = performance.now();
  for (let f = 0; f < frames; f++) {
    // Arms swinging through a 90 degree arc at 1 Hz keep the IK working.
    const a = (Math.PI / 2) * Math.sin((2 * Math.PI * f) / 30);
    const world = person({
      14: [-s.shoulderHalf - s.upperArm * Math.sin(a), s.torso - s.upperArm * Math.cos(a), 0],
      16: [-s.shoulderHalf - (s.upperArm + s.foreArm) * Math.sin(a), s.torso - (s.upperArm + s.foreArm) * Math.cos(a), 0],
    });
    retargeter.solve(tracker.update(world, world, f / 30));
  }
  const ms = (performance.now() - start) / frames;
  expect(ms < MAX_MS_PER_SOLVE, `${ms.toFixed(1)} ms per solve (limit ${MAX_MS_PER_SOLVE})`);
}

sim.delete();
if (failures.length) {
  console.error(`\ncheck-retarget failed: ${failures.length} of the checks above`);
  process.exit(1);
}
console.log('\ncheck-retarget passed');
