// Headless check that the robot moves smoothly on screen, with the real clips of data/clips: what
// playClip shows (smoothForDisplay) and what the live camera gives (the robot pose filter), against
// the raw RobotMotion and the raw retargeting. The video's frame-to-frame jitter is what made the
// robot look buggy even when it did not fall.
// Run: npm run check
import { readdirSync, readFileSync } from 'node:fs';
import { createRobotPoseFilter } from '../src/filters.js';
import { LOOP_BLEND_S, sampleLoopStart, sampleMotion, smoothForDisplay } from '../src/motion.js';
import { createPoseTracker } from '../src/pose.js';
import { createRetargeter } from '../src/retarget.js';
import { loadG1Node } from './node-model.mjs';

const SCREEN_DT = 1 / 60;
const KNEE = 7 + 3; // left_knee_joint in qpos
// A person walking moves the pelvis up and down with 2 to 5 m/s^2; the raw walk had 24.
const PELVIS_ACCEL = 6;
// A walking knee accelerates up to 100 to 200 rad/s^2 at heel strike; 100 at p95 means the swing,
// not frame-to-frame jitter (the raw walk had 191 before data/ smoothed the clips, 95 after).
const KNEE_ACCEL = 100;
// Feet on the floor: within 2 cm in 95% of what is drawn (a sole sphere is 1 cm across).
const FEET_M = 0.02;
// Live, one camera frame (33 ms) of lag is the price of the filter; more would show as the robot
// trailing the person.
const MAX_LAG_S = 0.04;

const { mujoco, sim } = await loadG1Node();
const kinematic = sim.createModel('g1_kinematics.xml', ['g1_kinematics.xml']);
const data = new mujoco.MjData(kinematic);
const feetBodies = ['left_ankle_roll_link', 'right_ankle_roll_link'].map((n) => mujoco.mj_name2id(kinematic, mujoco.mjtObj.mjOBJ_BODY.value, n));
const soles = [];
for (let g = 0; g < kinematic.ngeom; g++) {
  if (feetBodies.includes(kinematic.geom_bodyid[g]) && kinematic.geom_type[g] === mujoco.mjtGeom.mjGEOM_SPHERE.value) soles.push(g);
}
const lowestSole = (q) => {
  data.qpos.set(q);
  mujoco.mj_kinematics(kinematic, data);
  return Math.min(...soles.map((g) => data.geom_xpos[3 * g + 2] - kinematic.geom_size[3 * g]));
};
const p95 = (a) => [...a].map(Math.abs).sort((x, y) => x - y)[Math.floor(0.95 * (a.length - 1))];
const rate = (a, dt) => a.slice(1).map((v, i) => (v - a[i]) / dt);
const accel = (a, dt) => p95(rate(rate(a, dt), dt));

const failures = [];
const expect = (ok, what) => {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${what}`);
  if (!ok) failures.push(what);
};
const read = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url)));

console.log('playClip: the walk as the screen shows it, at 60 frames per second');
{
  const motion = read('../motions/clip_2026-10-23_caminar-perfil_01.json');
  const shown = smoothForDisplay(mujoco, kinematic, motion);
  const duration = (motion.qpos.length - 1) / motion.fps;
  const raw = [];
  const smooth = [];
  for (let t = 0; t <= duration; t += SCREEN_DT) {
    raw.push(Array.from(sampleMotion(motion, t, new Float64Array(sim.model.nq))));
    smooth.push(Array.from(sampleMotion(shown, t, new Float64Array(sim.model.nq))));
  }
  const pelvis = (rows) => accel(rows.map((q) => q[2]), SCREEN_DT);
  const knee = (rows) => accel(rows.map((q) => q[KNEE]), SCREEN_DT);
  expect(pelvis(smooth) < PELVIS_ACCEL, `pelvis height acceleration ${pelvis(smooth).toFixed(1)} m/s^2 (p95; raw ${pelvis(raw).toFixed(1)}), under ${PELVIS_ACCEL}`);
  expect(knee(smooth) < KNEE_ACCEL, `knee acceleration ${knee(smooth).toFixed(0)} rad/s^2 (p95; raw ${knee(raw).toFixed(0)}), under ${KNEE_ACCEL}`);
  const feet = p95(smooth.map(lowestSole));
  expect(feet < FEET_M, `feet within ${(100 * feet).toFixed(1)} cm of the floor in 95% of frames, under ${100 * FEET_M}`);
}

console.log('playClip with plantFeet: the walk with its foot on the floor kept still');
{
  // A foot carrying the weight does not move. Without plantFeet the walk's slides backward at
  // 0.35 m/s (median), as on a treadmill; with it, 0.13 (motion.js PLANT_SMOOTH_S). The limit
  // catches a return to sliding, not the noise between those two.
  const SLIDE_M_S = 0.2;
  const motion = read('../motions/clip_2026-10-23_caminar-perfil_01.json');
  const duration = (motion.qpos.length - 1) / motion.fps;
  const footPositions = (q) => {
    data.qpos.set(q);
    mujoco.mj_kinematics(kinematic, data);
    return feetBodies.map((b) => [data.xpos[3 * b], data.xpos[3 * b + 1], data.xpos[3 * b + 2]]);
  };
  // Horizontal speed of the lower foot, over the screen frames where it stays the lower one.
  const slide = (shown) => {
    const speeds = [];
    let previous = null;
    for (let t = 0; t <= duration; t += SCREEN_DT) {
      const feet = footPositions(sampleMotion(shown, t, new Float64Array(sim.model.nq)));
      const low = feet[0][2] < feet[1][2] ? 0 : 1;
      if (previous && previous.low === low) speeds.push(Math.hypot(feet[low][0] - previous.feet[low][0], feet[low][1] - previous.feet[low][1]) / SCREEN_DT);
      previous = { low, feet };
    }
    return speeds.sort((a, b) => a - b)[Math.floor(speeds.length / 2)];
  };
  const planted = smoothForDisplay(mujoco, kinematic, motion, { plantFeet: true });
  const plain = slide(smoothForDisplay(mujoco, kinematic, motion));
  const still = slide(planted);
  expect(still < SLIDE_M_S, `the foot on the floor slides ${still.toFixed(2)} m/s (median; ${plain.toFixed(2)} without plantFeet), under ${SLIDE_M_S}`);
  const rows = [];
  for (let t = 0; t <= duration; t += SCREEN_DT) rows.push(Array.from(sampleMotion(planted, t, new Float64Array(sim.model.nq))));
  const height = accel(rows.map((q) => q[2]), SCREEN_DT);
  expect(height < PELVIS_ACCEL, `pelvis height acceleration ${height.toFixed(1)} m/s^2 (p95), under ${PELVIS_ACCEL}`);
  const travel = Math.hypot(rows.at(-1)[0] - rows[0][0], rows.at(-1)[1] - rows[0][1]);
  console.log(`       (the walk covers ${travel.toFixed(1)} m with plantFeet, ${Math.hypot(motion.qpos.at(-1)[0] - motion.qpos[0][0], motion.qpos.at(-1)[1] - motion.qpos[0][1]).toFixed(1)} as retargeted)`);
}

console.log('upright sideways: no constant lean in what the screen shows (level.js)');
{
  // Seen from the side, MediaPipe's depth bias leaned the walk's G1 6 degrees sideways for the whole
  // clip. A person sways a degree or two each step around upright; over the clip, the torso's mean
  // sideways lean must stay under 1.5 degrees, in every clip.
  const MAX_LEAN_DEG = 1.5;
  const torso = mujoco.mj_name2id(kinematic, mujoco.mjtObj.mjOBJ_BODY.value, 'torso_link');
  for (const id of readdirSync(new URL('../motions/', import.meta.url)).filter((f) => f.endsWith('.json'))) {
    const leanOf = (motion) => {
      let sum = 0;
      for (const q of motion.qpos) {
        data.qpos.set(q);
        mujoco.mj_kinematics(kinematic, data);
        const up = [2, 5, 8].map((k) => data.xmat[9 * torso + k]);
        const yaw = 2 * Math.atan2(q[6], q[3]);
        sum += -Math.sin(yaw) * up[0] + Math.cos(yaw) * up[1]; // toward the robot's left
      }
      return (Math.asin(sum / motion.qpos.length) * 180) / Math.PI;
    };
    const raw = read(`../motions/${id}`);
    const shown = leanOf(smoothForDisplay(mujoco, kinematic, raw));
    expect(Math.abs(shown) < MAX_LEAN_DEG, `${id.replace('.json', '')}: torso leans ${shown.toFixed(1)} degrees sideways on average (the reference: ${leanOf(raw).toFixed(1)}), under ${MAX_LEAN_DEG}`);
  }
}

console.log('starting a clip over: no jump from its last pose to its first');
{
  // Each loop used to jump from the last pose to the first: 67 degrees in a joint in the run, 147 in
  // the jumping jacks. Across the loop, at 60 frames per second, no joint may move more than in the
  // clip's own fastest 1% of screen frames (it is a move, not a jump).
  for (const id of readdirSync(new URL('../motions/', import.meta.url)).filter((f) => f.endsWith('.json'))) {
    const motion = smoothForDisplay(mujoco, kinematic, read(`../motions/${id}`));
    const duration = (motion.qpos.length - 1) / motion.fps;
    const pose = (t, wrapped) => Array.from(wrapped ? sampleLoopStart(motion, t, new Float64Array(sim.model.nq)) : sampleMotion(motion, t, new Float64Array(sim.model.nq)));
    const steps = [];
    let previous = pose(0, false);
    for (let t = SCREEN_DT; t <= duration; t += SCREEN_DT) {
      const q = pose(t, false);
      steps.push(Math.max(...q.slice(7).map((v, k) => Math.abs(v - previous[7 + k]))));
      previous = q;
    }
    const usual = [...steps].sort((a, b) => a - b)[Math.floor(0.99 * (steps.length - 1))];
    const end = pose(duration, false);
    const jump = Math.max(...pose(0, false).slice(7).map((v, k) => Math.abs(v - end[7 + k])));
    let worst = 0;
    previous = end;
    for (let t = SCREEN_DT; t < LOOP_BLEND_S + SCREEN_DT; t += SCREEN_DT) {
      const q = pose(t, true);
      worst = Math.max(worst, ...q.slice(7).map((v, k) => Math.abs(v - previous[7 + k])));
      previous = q;
    }
    const deg = (r) => ((r * 180) / Math.PI).toFixed(0);
    expect(worst <= usual * 1.05, `${id.replace('.json', '')}: at most ${deg(worst)} degrees per screen frame across the loop (the jump was ${deg(jump)}; the clip's own p99 is ${deg(usual)})`);
  }
}

console.log('mimic: the walk fed frame by frame like the live camera');
{
  const clip = read('../../data/clips/clip_2026-10-23_caminar-perfil_01.json');
  const tracker = createPoseTracker();
  const retargeter = createRetargeter(mujoco, kinematic, { mirror: false });
  const filter = createRobotPoseFilter(sim.model.nq);
  const raw = [];
  const smooth = [];
  for (const f of clip.frames) {
    // PoseClip axes (y up, z toward the camera) back to MediaPipe's (y down, z away).
    const world = f.joints.map(([x, y, z, v]) => ({ x, y: -y, z: -z, visibility: v }));
    const { qpos } = retargeter.solve(tracker.update(world, world, f.t));
    raw.push(Array.from(qpos));
    smooth.push(Array.from(filter.filter(qpos, f.t)));
  }
  const dt = 1 / clip.fps;
  const pelvis = (rows) => accel(rows.map((q) => q[2]), dt);
  const knee = (rows) => accel(rows.map((q) => q[KNEE]), dt);
  expect(pelvis(smooth) < PELVIS_ACCEL * 1.5, `pelvis height acceleration ${pelvis(smooth).toFixed(1)} m/s^2 (p95; raw ${pelvis(raw).toFixed(1)}), under ${PELVIS_ACCEL * 1.5} (live has no future frames)`);
  expect(knee(smooth) < KNEE_ACCEL, `knee acceleration ${knee(smooth).toFixed(0)} rad/s^2 (p95; raw ${knee(raw).toFixed(0)}), under ${KNEE_ACCEL}`);
  // Lag: the delay at which the filtered knee matches the raw one best.
  const k = raw.map((q) => q[KNEE]);
  const s = smooth.map((q) => q[KNEE]);
  let lag = 0;
  let best = Infinity;
  for (let shift = 0; shift <= 6; shift++) {
    let err = 0;
    for (let i = shift; i < k.length; i++) err += (s[i] - k[i - shift]) ** 2;
    if (err < best) [best, lag] = [err, shift * dt];
  }
  expect(lag <= MAX_LAG_S, `follows the person ${(1000 * lag).toFixed(0)} ms late, at most ${1000 * MAX_LAG_S}`);
}

data.delete();
kinematic.delete();
sim.delete();
if (failures.length) {
  console.error(`\ncheck-smooth failed: ${failures.length} of the checks above`);
  process.exit(1);
}
console.log('\ncheck-smooth passed');
