// A whole PoseClip (data/) -> a RobotMotion (docs/contrato.md): one G1 qpos row per frame, with
// the pelvis following the person's path and heading. It is the reference the training imitates,
// and what the web plays next to the person in the gallery.
//
// Per frame this is the same retargeting as the live camera (retarget.js). What a clip adds is
// that it has a whole path, so the pelvis can travel and turn:
//   position  the hips' path, scaled to the robot's legs, so its stride matches its travel
//   heading   the direction of travel, because the hip line is noisy seen from the side
import { createPoseTracker } from './pose.js';
import { createClearance } from './clearance.js';
import { levelClip } from './level.js';
import { createReference } from './reference.js';
import { createRetargeter } from './retarget.js';
import { idOf } from './sim.js';

// Below this speed the person is standing or shuffling, and the direction of travel is noise:
// the heading comes from the hips instead. Walking is about 1 m/s.
const MIN_TRAVEL_SPEED = 0.25; // m/s
// The direction of travel is the net displacement over this window around each frame, long
// enough to average the steps and MediaPipe's depth noise (measured on the real walking clip:
// the heading wobbles +-16 degrees with 1 s, +-17 with 2 s and +-10 with 3 s). A turn sharper
// than a few seconds lags behind.
const HEADING_WINDOW_S = 3;
// The pelvis position is rounded to this many decimals (0.01 mm), joint angles to the same:
// well below anything visible, and it keeps the JSON small.
const DECIMALS = 5;

const round = (v) => Math.round(v * 10 ** DECIMALS) / 10 ** DECIMALS;

/**
 * @param mujoco  the loaded @mujoco/mujoco module
 * @param model   the G1's MjModel
 * @param clip    a PoseClip (y up, z toward the camera, origin at the first frame's hips)
 * @param options.mirror  move like a reflection instead of like the person (default no: a clip
 *   is shown next to the person, left with left)
 * @returns { motion, stats } `motion` is the RobotMotion; `stats` says how good it is:
 *   frames, tracked (frames where the shoulders were seen), reached (fraction of frames with every
 *   limb within 8 cm of the person's), scale (robot leg / person leg) and travel (m, robot's)
 */
export function retargetClip(mujoco, model, clip, options) {
  const steps = retargetSteps(mujoco, model, clip, options);
  let step;
  while (!(step = steps.next()).done);
  return step.value;
}

/**
 * The same as retargetClip, in slices: it works for `budgetMs` and then lets the page breathe
 * (draw, answer clicks) before going on. A frame costs about 2 ms (Node and browser alike), so a
 * 12 s clip is 0.7 s of work: short, but a camera frame is 16 ms and an upload can be 30 s.
 * @param options.onProgress  called with 0 to 1 after each slice
 * @param options.budgetMs    how long to work between pauses (default 8: about half a frame at 60 fps)
 * @param options.cancelled   checked after each slice; if it returns true the work stops and the
 *   result is null (the model may be freed by then)
 */
export async function retargetClipAsync(mujoco, model, clip, { onProgress, budgetMs = 8, cancelled, ...options } = {}) {
  const steps = retargetSteps(mujoco, model, clip, options);
  let sliceStart = performance.now();
  for (let step = steps.next(); ; step = steps.next()) {
    if (step.done) return step.value;
    if (performance.now() - sliceStart >= budgetMs) {
      onProgress?.(step.value / clip.frames.length);
      await new Promise((resolve) => setTimeout(resolve));
      if (cancelled?.()) {
        steps.return(); // runs the generator's cleanup
        return null;
      }
      sliceStart = performance.now();
    }
  }
}

// One yield per frame (its index), and the result as the return value, so the two entry points
// above share every line of the work.
function* retargetSteps(mujoco, model, clip, { mirror = false } = {}) {
  const retargeter = createRetargeter(mujoco, model, { mirror });
  const tracker = createPoseTracker();
  const { frames } = clip;

  // The hips' path in the robot's axes (x forward, y left): PoseClip x -> robot y, z -> robot x.
  const hips = frames.map(({ joints: J }) => [(J[23][2] + J[24][2]) / 2, (J[23][0] + J[24][0]) / 2]);
  const scale = pathScale(frames, retargeter.legLength);

  const rows = [];
  let tracked = 0;
  let reached = 0;
  let travel = 0;
  try {
    for (let i = 0; i < frames.length; i++) {
      const frame = frames[i];
      // The tracker and the solver read MediaPipe's own axes (y down, z away from the camera).
      const world = frame.joints.map(([x, y, z, visibility]) => ({ x, y: -y, z: -z, visibility }));
      const result = retargeter.solve(tracker.update(world, world, frame.t), { travelYaw: travelHeading(frames, hips, i) });
      const qpos = Array.from(result.qpos, round);
      qpos[0] = round(scale * (hips[i][0] - hips[0][0]));
      qpos[1] = round(scale * (hips[i][1] - hips[0][1]));
      rows.push(qpos);
      if (result.tracked) tracked++;
      if (result.tracked && result.residual < REACH_TOLERANCE) reached++;
      travel = Math.hypot(qpos[0], qpos[1]);
      yield i + 1;
    }
  } finally {
    retargeter.delete();
  }

  return {
    motion: { clip_id: clip.id, robot: 'unitree_g1', fps: clip.fps, qpos: rows },
    stats: { frames: frames.length, tracked, reached: reached / frames.length, scale, travel },
  };
}

// A limb farther than this from where the person put it is a move the G1 cannot make (it is the
// same 8 cm tolerance Sombra used).
export const REACH_TOLERANCE = 0.08; // m

// Robot leg length over the person's, from the median of the frames where both legs are seen.
// The G1's legs are shorter, so copying the path as is would make its feet slide.
function pathScale(frames, robotLeg) {
  const lengths = [];
  for (const { joints: J } of frames) {
    for (const [hip, knee, ankle] of [[23, 25, 27], [24, 26, 28]]) {
      if (Math.min(J[hip][3], J[knee][3], J[ankle][3]) < 0.5) continue;
      lengths.push(distance(J[hip], J[knee]) + distance(J[knee], J[ankle]));
    }
  }
  if (!lengths.length) return 1;
  lengths.sort((a, b) => a - b);
  return robotLeg / lengths[Math.floor(lengths.length / 2)];
}

const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

// Direction (rad, robot axes) the person travels around frame i, or undefined if they are
// (nearly) still.
function travelHeading(frames, hips, i) {
  const t = frames[i].t;
  let a = i;
  let b = i;
  while (a > 0 && frames[a].t > t - HEADING_WINDOW_S / 2) a--;
  while (b < frames.length - 1 && frames[b].t < t + HEADING_WINDOW_S / 2) b++;
  const dt = frames[b].t - frames[a].t;
  if (dt <= 0) return undefined;
  const dx = hips[b][0] - hips[a][0];
  const dy = hips[b][1] - hips[a][1];
  return Math.hypot(dx, dy) / dt < MIN_TRAVEL_SPEED ? undefined : Math.atan2(dy, dx);
}

// For the screen only, the pelvis height is also smoothed over 0.2 s after the feet are put on the
// floor. Grounding the lowest foot every frame makes the pelvis jump when support passes from one
// foot to the other: 15 m/s^2 of vertical acceleration (p95) in the walk, where a person has 2 to 5.
// With 0.2 s it is 4.5, and the feet sink or float at most ~1.2 cm in 95% of the frames (measured
// on data/clips' walk; 0.3 s gave 3.4 m/s^2 but 1.9 cm of floating). Training keeps the reference as
// it is (reference.js mirrors Python), because a policy's feet must really be on the floor.
const DISPLAY_HEIGHT_SMOOTH_S = 0.2;

// Why the foot on the floor slides, and what plantFeet does (measured on data/clips' walk, at 60
// frames per second): the pelvis path, the person's scaled to the robot's legs, covers 7.5 m in
// 11.85 s (0.63 m/s), while the robot's own stride covers 9.8 m, so the foot carrying the weight
// slides backward at 0.35 m/s (median; p95 1.30), as on a treadmill. plantFeet re-makes the
// horizontal path from that foot (the lower one): whatever it moves against the pelvis, the pelvis
// moved the other way, as data/lift.py does with the person's feet. The foot then slides 0.13 m/s
// (p95 0.48). Smoothing the new path over 0.1 s plants it harder (0.04) but the pelvis jerks at
// each change of foot (15 m/s² of horizontal acceleration, p95, against 7 without plantFeet; 0.2 s
// gives 9). Opt-in, for clips that walk: in a run the lower foot is in the air during flight (the
// run went from 8.8 m to 0.5 m of travel), and in jumping jacks the feet spreading would swing the
// pelvis sideways.
const PLANT_SMOOTH_S = 0.2;
// A sole within 1 cm of the floor carries weight, above 2 cm it swings (root.js, where measured).
const CONTACT_LOW_M = 0.01;
const CONTACT_HIGH_M = 0.02;
const ANKLES = ['left_ankle_roll_link', 'right_ankle_roll_link'];

const displayed = new WeakMap(); // RobotMotion -> { plain, planted }: its smoothed copies, computed once

// Centered moving average of `values` over `window` samples, repeating the edges.
function movingAverage(values, window) {
  const n = values.length;
  const pad = Math.floor(window / 2);
  return values.map((_, i) => {
    let sum = 0;
    for (let k = i - pad; k < i - pad + window; k++) sum += values[Math.min(Math.max(k, 0), n - 1)];
    return sum / window;
  });
}

// The model's sole spheres, by foot (left, right): the G1 models each foot as four small spheres.
function soleGeoms(mujoco, model) {
  return ANKLES.map((name) => {
    const body = idOf(mujoco, model, 'BODY', name);
    const ids = [];
    for (let g = 0; g < model.ngeom; g++) {
      if (model.geom_bodyid[g] === body && model.geom_type[g] === mujoco.mjtGeom.mjGEOM_SPHERE.value) ids.push(g);
    }
    return ids;
  });
}

// Lowers or raises each row's pelvis so its lowest sole touches the floor.
function groundRows(mujoco, model, qpos) {
  const data = new mujoco.MjData(model);
  const soles = soleGeoms(mujoco, model).flat();
  for (const q of qpos) {
    data.qpos.set(q);
    mujoco.mj_kinematics(model, data);
    q[2] -= Math.min(...soles.map((g) => data.geom_xpos[3 * g + 2] - model.geom_size[3 * g]));
  }
  data.delete();
}

// Rewrites the pelvis x and y of `qpos` (rows of the G1's 36 values) so that the foot on the floor
// stays where it is from one frame to the next (see PLANT_SMOOTH_S). Each foot carries a share of
// the weight by its height (root.js, the live camera's version, where the thresholds are measured):
// the share passes from foot to foot smoothly, two feet down anchor their average, and with both
// feet up (a run's flight) the pelvis keeps the retargeted path's own step.
function plantFeet(mujoco, model, qpos, fps) {
  const data = new mujoco.MjData(model);
  const feet = ANKLES.map((name) => idOf(mujoco, model, 'BODY', name));
  const soles = soleGeoms(mujoco, model);
  // Each foot against the pelvis, in world axes, and its lowest sole's height above the floor.
  const rel = qpos.map((q) => {
    data.qpos.set(q);
    mujoco.mj_kinematics(model, data);
    return feet.map((b, f) => [
      data.xpos[3 * b] - q[0],
      data.xpos[3 * b + 1] - q[1],
      Math.min(...soles[f].map((g) => data.geom_xpos[3 * g + 2] - model.geom_size[3 * g])),
    ]);
  });
  data.delete();
  const path = [[qpos[0][0], qpos[0][1]]];
  for (let i = 1; i < qpos.length; i++) {
    const weights = rel[i].map(([, , h]) => Math.min(1, Math.max(0, (CONTACT_HIGH_M - h) / (CONTACT_HIGH_M - CONTACT_LOW_M))));
    const total = weights[0] + weights[1];
    const contact = Math.min(1, total);
    const [x, y] = path[i - 1];
    const step = [0, 1].map((a) => {
      const feetStep = total > 0 ? rel[i].reduce((sum, foot, f) => sum + (weights[f] / total) * (foot[a] - rel[i - 1][f][a]), 0) : 0;
      return -contact * feetStep + (1 - contact) * (qpos[i][a] - qpos[i - 1][a]);
    });
    path.push([x + step[0], y + step[1]]);
  }
  const window = Math.max(1, Math.round(PLANT_SMOOTH_S * fps));
  const xs = movingAverage(path.map((p) => p[0]), window);
  const ys = movingAverage(path.map((p) => p[1]), window);
  qpos.forEach((row, i) => {
    row[0] = xs[i];
    row[1] = ys[i];
  });
}

/**
 * The RobotMotion the robot shows: the training's clean reference (joints and path smoothed, feet
 * on the floor; reference.js) at each frame, with the pelvis height smoothed for the eye. Same frames
 * and fps, so it plays in step with the person's skeleton.
 * @param model  a model of the G1 with its feet (g1_kinematics.xml is enough)
 * @param options.plantFeet  the pelvis path re-made so the foot on the floor does not slide
 *   (plantFeet above): true, false, or 'auto' (planted unless the feet do not explain the travel,
 *   as in a run seen from the side: feetExplainTravel).
 */
export function smoothForDisplay(mujoco, model, motion, { plantFeet: planted = false } = {}) {
  const key = planted === 'auto' ? 'auto' : planted ? 'planted' : 'plain';
  const cached = displayed.get(motion) ?? {};
  if (cached[key]) return cached[key];
  let smoothed;
  if (planted === 'auto') {
    const plain = smoothForDisplay(mujoco, model, motion);
    const feet = smoothForDisplay(mujoco, model, motion, { plantFeet: true });
    smoothed = feetExplainTravel(plain.qpos, feet.qpos) ? feet : plain;
  } else {
    const reference = createReference(mujoco, model, motion);
    const qpos = motion.qpos.map((_, i) => reference.sample(i / motion.fps).q);
    // Upright sideways (level.js), then the feet back on the floor: leveling moves the soles a bit.
    levelClip(mujoco, model, qpos, motion.fps);
    // Feet apart and hands out of the legs (clearance.js), before the feet go back on the floor.
    const clearance = createClearance(mujoco, model);
    clearance.clearClip(qpos, motion.fps);
    clearance.delete();
    groundRows(mujoco, model, qpos);
    const window = Math.max(1, Math.round(DISPLAY_HEIGHT_SMOOTH_S * motion.fps));
    const height = movingAverage(qpos.map((row) => row[2]), window);
    qpos.forEach((row, i) => (row[2] = height[i]));
    if (planted) plantFeet(mujoco, model, qpos, motion.fps);
    smoothed = { ...motion, qpos };
  }
  displayed.set(motion, { ...displayed.get(motion), [key]: smoothed });
  return smoothed;
}

// plantFeet: 'auto' keeps the planted path unless the clip travels and its feet do not explain it.
// The run of data/clips covers 8.8 m but its retargeted legs only 0.9 m (seen from the side, the
// legs swing mostly along the depth axis): planted, it would run in place. The walk covers 7.5 m
// and its feet 9.6, and jumping jacks stay within 0.3 m either way (planted, the pelvis sways 6 cm
// instead of 34), so both are planted.
const AUTO_TRAVEL_M = 1;
const AUTO_MIN_SHARE = 0.5;
function feetExplainTravel(plain, planted) {
  const travel = (q) => Math.hypot(q.at(-1)[0] - q[0][0], q.at(-1)[1] - q[0][1]);
  return travel(plain) < AUTO_TRAVEL_M || travel(planted) >= AUTO_MIN_SHARE * travel(plain);
}

// A clip that loops jumps from its last pose to its first: in the run (3.8 s) a joint jumped 67
// degrees every loop, in the jumping jacks 147. For this long after starting over, the robot goes
// from the last pose to the clip's own instead: long enough to read as a move, short enough to
// lose little of the clip.
export const LOOP_BLEND_S = 0.3;

/**
 * The pose at time `t` (s) of a clip that just started over: sampleMotion(motion, t), eased in from
 * the clip's last pose over LOOP_BLEND_S. The pelvis position on the floor is not blended (it goes
 * back to the start of the path; the camera follows it), only its height, its heading and the joints.
 */
export function sampleLoopStart(motion, t, out, last = new Float64Array(out.length)) {
  sampleMotion(motion, t, out);
  if (t >= LOOP_BLEND_S) return out;
  sampleMotion(motion, motionDuration(motion), last);
  const u = Math.max(0, t) / LOOP_BLEND_S;
  const w = u * u * (3 - 2 * u); // smoothstep: no jolt at either end
  if (last[3] * out[3] + last[4] * out[4] + last[5] * out[5] + last[6] * out[6] < 0) for (let j = 3; j < 7; j++) last[j] = -last[j]; // same hemisphere
  for (let j = 2; j < out.length; j++) out[j] = last[j] + (out[j] - last[j]) * w;
  const norm = Math.hypot(out[3], out[4], out[5], out[6]);
  for (let j = 3; j < 7; j++) out[j] /= norm;
  return out;
}

/** Seconds a RobotMotion lasts: its frames are 1/fps apart, so the last one is at (n - 1) / fps. */
export const motionDuration = (motion) => (motion.qpos.length - 1) / motion.fps;

/**
 * The pose at time `t` (s), written into `out` (a Float64Array of the robot's nq). A clip is 24 to
 * 30 frames per second and the screen 60, so the frames around `t` are blended with a Catmull-Rom
 * curve through the two on each side: joints and the pelvis position, and the pelvis orientation's
 * four numbers, normalized after (exact enough here, consecutive frames differ by a few degrees).
 * A straight line between two frames changed the speed at every frame of the clip, a small jerk
 * 30 times a second that showed as stepping, most in slow motion.
 * `t` outside the clip is held at its first or last frame.
 */
export function sampleMotion(motion, t, out) {
  const rows = motion.qpos;
  const last = rows.length - 1;
  const x = Math.min(Math.max(t * motion.fps, 0), last);
  const i = Math.floor(x);
  const p0 = rows[Math.max(i - 1, 0)];
  const p1 = rows[i];
  const p2 = rows[Math.min(i + 1, last)];
  const p3 = rows[Math.min(i + 2, last)];
  const k = x - i;
  const k2 = k * k;
  const k3 = k2 * k;
  for (let j = 0; j < p1.length; j++) {
    // The orientation's neighbors on p1's side of the quaternion double cover.
    const sign = (p) => (j >= 3 && j < 7 && p[3] * p1[3] + p[4] * p1[4] + p[5] * p1[5] + p[6] * p1[6] < 0 ? -1 : 1);
    const a = sign(p0) * p0[j];
    const b = p1[j];
    const c = sign(p2) * p2[j];
    const d = sign(p3) * p3[j];
    out[j] = 0.5 * (2 * b + (c - a) * k + (2 * a - 5 * b + 4 * c - d) * k2 + (3 * b - a - 3 * c + d) * k3);
  }
  const norm = Math.hypot(out[3], out[4], out[5], out[6]);
  for (let j = 3; j < 7; j++) out[j] /= norm;
  return out;
}
