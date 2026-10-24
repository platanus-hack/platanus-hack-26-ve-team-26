// Headless check of the copying robot's place on the floor (root.js), with the real walk of
// data/clips fed frame by frame like the live camera: its 3D points centered on the hips, and the
// hips' place from the camera, with the camera fit's noise. Then a jump in place, made from the
// walk's first frame. The robot must walk with its planted foot still, cover the person's path, not
// jump while walking, and leave the floor when the person jumps.
// Run: npm run check
import { readFileSync } from 'node:fs';
import { createRobotPoseFilter } from '../src/filters.js';
import { createPoseTracker } from '../src/pose.js';
import { createRetargeter } from '../src/retarget.js';
import { createLeveler } from '../src/level.js';
import { createRootTracker } from '../src/root.js';
import { loadG1Node } from './node-model.mjs';

// The person stands this far from the camera, and the camera fit wobbles this much (m, one
// standard deviation): data/live's synthetic walk and real webcams at 3 to 4 m show 1 to 3 cm.
const DEPTH_M = 4;
const NOISE_M = 0.02;
// Same limit as check-smooth's plantFeet: above it the foot visibly slides.
const SLIDE_M_S = 0.2;
// The robot's path must cover most of the person's, scaled to its legs (the feet's stride and the
// path differ by up to 30%: motion.js).
const MIN_TRAVEL_SHARE = 0.7;
// A 30 cm jump of the person is ~22 cm for the G1's legs; the eased lift must reach most of it.
const JUMP_M = 0.3;
const MIN_ROBOT_JUMP_M = 0.12;

const { mujoco, sim } = await loadG1Node();
const kinematic = sim.createModel('g1_kinematics.xml', ['g1_kinematics.xml']);
const data = new mujoco.MjData(kinematic);
const ankles = ['left_ankle_roll_link', 'right_ankle_roll_link'].map((n) => mujoco.mj_name2id(kinematic, mujoco.mjtObj.mjOBJ_BODY.value, n));
const feetOf = (q) => {
  data.qpos.set(q);
  mujoco.mj_kinematics(kinematic, data);
  return ankles.map((b) => [data.xpos[3 * b], data.xpos[3 * b + 1], data.xpos[3 * b + 2]]);
};

const failures = [];
const expect = (ok, what) => {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${what}`);
  if (!ok) failures.push(what);
};

// A seeded normal, so the check gives the same numbers every run.
let seed = 7;
const uniform = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const gauss = () => Math.sqrt(-2 * Math.log(uniform())) * Math.cos(2 * Math.PI * uniform());

// One PoseClip frame (y up, z toward the camera, with the path) as a live pose: MediaPipe world
// points centered on the hips (y down, z away), and the hips' place from the camera.
function livePose(joints, t, rise = 0) {
  const hip = [0, 1, 2].map((a) => (joints[23][a] + joints[24][a]) / 2);
  const world = joints.map(([x, y, z, visibility]) => ({ x: x - hip[0], y: -(y - hip[1]), z: -(z - hip[2]), visibility }));
  const camera = [hip[0] + NOISE_M * gauss(), -(hip[1] + rise) + NOISE_M * gauss(), DEPTH_M - hip[2] + NOISE_M * gauss()];
  return { world, landmarks: world, visible: true, t, camera };
}

function run(poses) {
  const tracker = createPoseTracker();
  const retargeter = createRetargeter(mujoco, kinematic, { mirror: false });
  const filter = createRobotPoseFilter(kinematic.nq);
  const root = createRootTracker(mujoco, kinematic, { mirror: false, legLength: retargeter.legLength });
  const leveler = createLeveler(mujoco, kinematic);
  const rows = poses.map((pose) => {
    const { qpos } = retargeter.solve(tracker.update(pose.world, pose.landmarks, pose.t), { travelYaw: root.travelYaw() });
    return { q: Array.from(root.update(leveler.level(filter.filter(qpos, pose.t), pose.t), pose)), airborne: root.airborne() };
  });
  retargeter.delete();
  root.delete();
  leveler.delete();
  return { rows, legLength: retargeter.legLength };
}

const clip = JSON.parse(readFileSync(new URL('../../data/clips/clip_2026-10-23_caminar-perfil_01.json', import.meta.url)));

console.log('mimic: the walk of data/clips, live, with the camera');
{
  const { rows, legLength } = run(clip.frames.map((f) => livePose(f.joints, f.t)));
  // Horizontal speed of the lower foot over the frames where it stays the lower one.
  const speeds = [];
  let previous = null;
  for (const { q } of rows) {
    const feet = feetOf(q);
    const low = feet[0][2] < feet[1][2] ? 0 : 1;
    if (previous && previous.low === low) speeds.push(Math.hypot(feet[low][0] - previous.feet[low][0], feet[low][1] - previous.feet[low][1]) * clip.fps);
    previous = { low, feet };
  }
  const slide = speeds.sort((a, b) => a - b)[speeds.length >> 1];
  expect(slide < SLIDE_M_S, `the foot on the floor slides ${slide.toFixed(2)} m/s (median), under ${SLIDE_M_S}`);

  const hips = (f) => [(f.joints[23][0] + f.joints[24][0]) / 2, (f.joints[23][2] + f.joints[24][2]) / 2];
  const [a, b] = [hips(clip.frames[0]), hips(clip.frames.at(-1))];
  const legs = clip.frames.flatMap(({ joints: J }) => [[23, 25, 27], [24, 26, 28]].map(([h, k, an]) => {
    const d = (i, j) => Math.hypot(J[i][0] - J[j][0], J[i][1] - J[j][1], J[i][2] - J[j][2]);
    return d(h, k) + d(k, an);
  })).sort((x, y) => x - y);
  const person = (Math.hypot(b[0] - a[0], b[1] - a[1]) * legLength) / legs[legs.length >> 1];
  const robot = Math.hypot(rows.at(-1).q[0] - rows[0].q[0], rows.at(-1).q[1] - rows[0].q[1]);
  expect(robot > MIN_TRAVEL_SHARE * person, `the robot walks ${robot.toFixed(1)} m, the person's path scaled to its legs is ${person.toFixed(1)} (at least ${100 * MIN_TRAVEL_SHARE}%)`);
  // Upright sideways (level.js): the walk's torso leaned 6 degrees on average before; after the
  // leveler's first 2 s, under 1.5.
  const torso = mujoco.mj_name2id(kinematic, mujoco.mjtObj.mjOBJ_BODY.value, 'torso_link');
  const leans = rows.slice(2 * clip.fps).map(({ q }) => {
    data.qpos.set(q);
    mujoco.mj_kinematics(kinematic, data);
    const up = [2, 5, 8].map((k) => data.xmat[9 * torso + k]);
    const yaw = 2 * Math.atan2(q[6], q[3]);
    return -Math.sin(yaw) * up[0] + Math.cos(yaw) * up[1];
  });
  const lean = (Math.asin(leans.reduce((a, b) => a + b, 0) / leans.length) * 180) / Math.PI;
  expect(Math.abs(lean) < 1.5, `the torso leans ${lean.toFixed(1)} degrees sideways on average, under 1.5`);
  const jumps = rows.filter((r) => r.airborne).length;
  expect(jumps === 0, `no jump while walking (${jumps} frames in the air)`);
}

console.log('mimic: a jump in place');
{
  // The walk's first frame held still for 1 s, a 0.5 s jump of JUMP_M (a parabola), 1 s still.
  const fps = 30;
  const poses = [];
  for (let k = 0; k < 2.5 * fps; k++) {
    const t = k / fps;
    const u = (t - 1) / 0.5;
    const rise = u > 0 && u < 1 ? 4 * JUMP_M * u * (1 - u) : 0;
    poses.push(livePose(clip.frames[0].joints, t, rise));
  }
  const { rows } = run(poses);
  const standing = rows[Math.round(0.9 * fps)].q[2];
  const peak = Math.max(...rows.map((r) => r.q[2])) - standing;
  const after = rows.at(-1).q[2] - standing;
  expect(peak > MIN_ROBOT_JUMP_M, `the pelvis rises ${(100 * peak).toFixed(0)} cm in the person's ${100 * JUMP_M} cm jump, over ${100 * MIN_ROBOT_JUMP_M}`);
  expect(Math.abs(after) < 0.01, `and lands back on the floor (${(100 * after).toFixed(1)} cm off)`);
  const drift = Math.hypot(rows.at(-1).q[0] - rows[0].q[0], rows.at(-1).q[1] - rows[0].q[1]);
  expect(drift < 0.1, `standing and jumping in place, it stays in place (${(100 * drift).toFixed(0)} cm)`);
}

data.delete();
kinematic.delete();
sim.delete();
if (failures.length) {
  console.error(`\ncheck-root failed: ${failures.length} of the checks above`);
  process.exit(1);
}
console.log('\ncheck-root passed');
