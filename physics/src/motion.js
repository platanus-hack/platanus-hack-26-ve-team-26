// A whole PoseClip (data/) -> a RobotMotion (docs/contrato.md): one G1 qpos row per frame, with
// the pelvis following the person's path and heading. It is the reference the training imitates,
// and what the web plays next to the person in the gallery.
//
// Per frame this is the same retargeting as the live camera (retarget.js). What a clip adds is
// that it has a whole path, so the pelvis can travel and turn:
//   position  the hips' path, scaled to the robot's legs, so its stride matches its travel
//   heading   the direction of travel, because the hip line is noisy seen from the side
import { createPoseTracker } from './pose.js';
import { createRetargeter } from './retarget.js';

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

/** Seconds a RobotMotion lasts: its frames are 1/fps apart, so the last one is at (n - 1) / fps. */
export const motionDuration = (motion) => (motion.qpos.length - 1) / motion.fps;

/**
 * The pose at time `t` (s), written into `out` (a Float64Array of the robot's nq). A clip is 24 to
 * 30 frames per second and the screen 60, so the frames on both sides are blended: joints and
 * the pelvis position linearly, the pelvis orientation by normalized linear interpolation, which
 * is exact enough here because consecutive frames differ by a few degrees of heading.
 * `t` outside the clip is held at its first or last frame.
 */
export function sampleMotion(motion, t, out) {
  const rows = motion.qpos;
  const x = Math.min(Math.max(t * motion.fps, 0), rows.length - 1);
  const i = Math.floor(x);
  const a = rows[i];
  const b = rows[Math.min(i + 1, rows.length - 1)];
  const k = x - i;
  for (let j = 0; j < a.length; j++) out[j] = a[j] + (b[j] - a[j]) * k;
  const norm = Math.hypot(out[3], out[4], out[5], out[6]);
  for (let j = 3; j < 7; j++) out[j] /= norm;
  return out;
}
