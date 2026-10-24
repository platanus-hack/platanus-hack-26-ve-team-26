// Headless check of the camera retargeting: synthetic people in MediaPipe's own format go in,
// G1 joint angles come out, and each answer is known in advance.
// Run: npm run check
import { readdirSync, readFileSync } from 'node:fs';
import { loadG1Node } from './node-model.mjs';
import { createPoseTracker } from '../src/pose.js';
import { createRetargeter } from '../src/retarget.js';
import { motionDuration, retargetClip, retargetClipAsync, sampleMotion } from '../src/motion.js';

// Above this a limb ended up farther than 8 cm from where the person put it (Sombra's REACH_TOLERANCE).
const REACH_TOLERANCE = 0.08;
// One solve must fit comfortably in a camera frame (33 ms at 30 fps), next to MediaPipe and drawing.
const MAX_MS_PER_SOLVE = 12;
const STAND_PELVIS_Z = 0.793; // "stand" keyframe, with the feet on the floor

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

const { mujoco, sim } = await loadG1Node();

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

console.log("RobotMotion of Juan's walking clip (whole clip, with the pelvis path and heading)");
{
  const clip = JSON.parse(readFileSync(new URL('../../data/clips/clip_2026-10-23_caminar-perfil_01.json', import.meta.url)));
  const { motion, stats } = retargetClip(mujoco, sim.model, clip);
  const rows = motion.qpos;
  const median = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
  expect(motion.robot === 'unitree_g1' && motion.clip_id === clip.id && motion.fps === clip.fps, 'contract fields: clip_id, robot, fps');
  expect(rows.length === clip.frames.length && rows.every((r) => r.length === sim.model.nq && r.every(Number.isFinite)), `${rows.length} rows of ${sim.model.nq} finite numbers`);
  expect(rows.every((r) => Math.abs(Math.hypot(r[3], r[4], r[5], r[6]) - 1) < 1e-3), 'pelvis quaternions have unit length');
  // Every joint inside its limits (the solver clamps them).
  const range = sim.model.jnt_range;
  const jointsInRange = rows.every((r) => Array.from({ length: sim.model.njnt - 1 }, (_, k) => k + 1).every((jn) => {
    const v = r[sim.model.jnt_qposadr[jn]];
    return v >= range[2 * jn] - 1e-4 && v <= range[2 * jn + 1] + 1e-4;
  }));
  expect(jointsInRange, 'every joint within its limits');
  const heading = rows.map((r) => (2 * Math.atan2(r[6], r[3]) * 180) / Math.PI);
  const mid = median(heading);
  expect(heading.every((h) => Math.abs(h - mid) < 15), `heading steady: ${Math.min(...heading).toFixed(0)} to ${Math.max(...heading).toFixed(0)} degrees`);
  const end = rows[rows.length - 1];
  const pathHeading = (Math.atan2(end[1], end[0]) * 180) / Math.PI;
  expect(Math.abs(pathHeading - mid) < 10, `the pelvis walks where it faces (path ${pathHeading.toFixed(0)}, heading ${mid.toFixed(0)} degrees)`);
  expect(stats.scale > 0.6 && stats.scale < 1, `path scaled x${stats.scale.toFixed(2)} (the G1's legs are shorter than a person's)`);
  expect(rows.every((r) => r[2] > 0.55 && r[2] < 0.82), 'pelvis height stays between 0.55 and 0.82 m (feet on the floor)');

  // Sliding: over about 0.3 s the slower foot is the planted one. The robot must not slide more
  // than the person in the data does (its own depth noise is the limit, not the retargeting).
  const K = 4;
  const slideRatio = (feet, pelvis) => {
    const slide = [];
    const pel = [];
    for (let i = K; i < feet.length - K; i++) {
      const dt = clip.frames[i + K].t - clip.frames[i - K].t;
      const speed = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]) / dt;
      slide.push(Math.min(speed(feet[i + K][0], feet[i - K][0]), speed(feet[i + K][1], feet[i - K][1])));
      pel.push(speed(pelvis[i + K], pelvis[i - K]));
    }
    return median(slide) / median(pel);
  };
  const J = clip.frames.map((f) => f.joints);
  const human = slideRatio(J.map((j) => [[j[27][2], j[27][0]], [j[28][2], j[28][0]]]), J.map((j) => [(j[23][2] + j[24][2]) / 2, (j[23][0] + j[24][0]) / 2]));
  const robotFeet = rows.map((q) => {
    sim.puppet(q);
    return ['left_ankle_roll_link', 'right_ankle_roll_link'].map((n) => sim.bodyPosition(n).slice(0, 2));
  });
  const robot = slideRatio(robotFeet, rows.map((q) => [q[0], q[1]]));
  expect(robot <= human, `planted foot slides ${robot.toFixed(2)} of the pelvis speed (the person in the data: ${human.toFixed(2)})`);

  // The sliced version (what the browser runs) must give exactly the same motion.
  const progress = [];
  const sliced = await retargetClipAsync(mujoco, sim.model, clip, { budgetMs: 1, onProgress: (p) => progress.push(p) });
  expect(JSON.stringify(sliced.motion) === JSON.stringify(motion), `the sliced retargeting gives the same motion (${progress.length} slices)`);
  expect(progress.length > 3 && progress.every((p, i) => i === 0 || p >= progress[i - 1]), 'and reports a progress that only goes forward');

  // The mesh-free model the page retargets on must give the same motion as the full G1.
  const kinematics = sim.createModel('g1_kinematics.xml', ['g1_kinematics.xml']);
  const lean = retargetClip(mujoco, kinematics, clip).motion;
  kinematics.delete();
  const leanDiff = Math.max(...rows.flatMap((row, i) => row.map((v, j) => Math.abs(v - lean.qpos[i][j]))));
  expect(leanDiff < 1e-6, `the model without meshes gives the same motion (differs by at most ${leanDiff.toExponential(1)})`);

  // Playback: sampling a RobotMotion between its frames.
  const out = new Float64Array(sim.model.nq);
  // The rows keep 5 decimals, so their quaternions are unit length only to about 1e-5.
  const same = (a, b) => a.every((v, i) => Math.abs(v - b[i]) < 2e-5);
  expect(Math.abs(motionDuration(motion) - (rows.length - 1) / motion.fps) < 1e-9, `duration ${motionDuration(motion).toFixed(1)} s`);
  expect(same(sampleMotion(motion, 0, out), rows[0]) && same(sampleMotion(motion, -1, out), rows[0]), 'time 0 (and before) is the first frame');
  expect(same(sampleMotion(motion, 100, out), rows[rows.length - 1]), 'past the end holds the last frame');
  expect(same(sampleMotion(motion, 10 / motion.fps, out), rows[10]), 'an exact frame time gives that frame');
  sampleMotion(motion, 10.5 / motion.fps, out);
  const halfway = rows[10].map((v, i) => (v + rows[11][i]) / 2);
  expect([0, 1, 2, ...Array.from({ length: 29 }, (_, k) => 7 + k)].every((i) => Math.abs(out[i] - halfway[i]) < 1e-9), 'between two frames, joints and position are blended');
  expect(Math.abs(Math.hypot(out[3], out[4], out[5], out[6]) - 1) < 1e-9, 'the blended pelvis orientation stays a unit quaternion');
}

console.log('legs that do not cross, in every clip of data/clips (seen from the side, leg depth is noise)');
{
  // In the robot's own pelvis frame the left ankle must stay to the left of the right one; before
  // the hip penalties and the inward limit of retarget.js the walk crossed them in 12% of frames.
  // Hip twist: a person walking twists about 10 degrees; 25 at p95 leaves room for turns.
  const MAX_TWIST_DEG = 25;
  const data = new mujoco.MjData(sim.model);
  const id = (type, name) => mujoco.mj_name2id(sim.model, mujoco.mjtObj[`mjOBJ_${type}`].value, name);
  const [left, right, pelvis] = ['left_ankle_roll_link', 'right_ankle_roll_link', 'pelvis'].map((n) => id('BODY', n));
  const twist = ['left_hip_yaw_joint', 'right_hip_yaw_joint'].map((n) => sim.model.jnt_qposadr[id('JOINT', n)]);
  const clipsDir = new URL('../../data/clips/', import.meta.url);
  for (const file of readdirSync(clipsDir).filter((f) => f.endsWith('.json'))) {
    const { motion } = retargetClip(mujoco, sim.model, JSON.parse(readFileSync(new URL(file, clipsDir))));
    let crossed = 0;
    const twists = [];
    for (const q of motion.qpos) {
      data.qpos.set(q);
      mujoco.mj_kinematics(sim.model, data);
      const m = data.xmat.slice(9 * pelvis, 9 * pelvis + 9);
      const d = [0, 1, 2].map((k) => data.xpos[3 * left + k] - data.xpos[3 * right + k]);
      if (m[1] * d[0] + m[4] * d[1] + m[7] * d[2] < 0) crossed++; // along the pelvis' left axis
      twists.push(...twist.map((a) => Math.abs((q[a] * 180) / Math.PI)));
    }
    const p95 = twists.sort((a, b) => a - b)[Math.floor(0.95 * (twists.length - 1))];
    expect(crossed === 0 && p95 < MAX_TWIST_DEG, `${motion.clip_id}: feet crossed in ${crossed} of ${motion.qpos.length} frames, hip twist ${p95.toFixed(0)} degrees at p95 (under ${MAX_TWIST_DEG})`);
  }
  data.delete();
}

console.log("the walk's upper body: the hidden arm swings, the waist does not spin, no joint flips");
{
  // Seen from the side the far arm is hidden; it used to stay frozen in the stand pose. A walking
  // arm swings forward and back by tens of degrees. The waist turns about 10 degrees in a person;
  // 15 at p95 is the bar. A flip is a joint that jumps and comes back on the next frame.
  const clip = JSON.parse(readFileSync(new URL('../../data/clips/clip_2026-10-23_caminar-perfil_01.json', import.meta.url)));
  const rows = retargetClip(mujoco, sim.model, clip).motion.qpos;
  const deg = (r) => (r * 180) / Math.PI;
  const swing = (name) => { const v = rows.map((r) => deg(r[j(name)])); return Math.max(...v) - Math.min(...v); };
  const waist = rows.map((r) => Math.abs(deg(r[j('waist_yaw_joint')]))).sort((a, b) => a - b)[Math.floor(0.95 * (rows.length - 1))];
  let flips = 0;
  for (let i = 1; i < rows.length - 1; i++) {
    for (let k = 7; k < rows[i].length; k++) {
      const a = rows[i][k] - rows[i - 1][k];
      const b = rows[i + 1][k] - rows[i][k];
      if (Math.abs(a) > 0.25 && Math.abs(b) > 0.25 && Math.sign(a) !== Math.sign(b)) flips++;
    }
  }
  expect(Math.min(swing('left_shoulder_pitch_joint'), swing('right_shoulder_pitch_joint')) > 15, `both arms swing: left ${swing('left_shoulder_pitch_joint').toFixed(0)}, right ${swing('right_shoulder_pitch_joint').toFixed(0)} degrees`);
  expect(waist < 15, `waist turn ${waist.toFixed(0)} degrees at p95 (under 15)`);
  expect(flips === 0, `no joint flips back and forth between frames (${flips})`);
}

console.log('the RobotMotions saved in motions/ are up to date with the clips in data/clips');
{
  const dir = new URL('../motions/', import.meta.url);
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.json'))) {
    const saved = JSON.parse(readFileSync(new URL(file, dir)));
    const clip = JSON.parse(readFileSync(new URL(`../../data/clips/${file}`, import.meta.url)));
    const { motion } = retargetClip(mujoco, sim.model, clip);
    const worst = Math.max(...saved.qpos.flatMap((row, i) => row.map((v, j) => Math.abs(v - motion.qpos[i][j]))));
    expect(saved.qpos.length === motion.qpos.length && worst < 1e-4, `${file}: ${saved.qpos.length} frames, differs by at most ${worst.toExponential(1)} (run npm run retarget if not)`);
  }
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
