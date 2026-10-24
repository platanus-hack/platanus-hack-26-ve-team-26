// The reference an imitation policy follows: a RobotMotion cleaned for the training model and
// sampled at any time. A port of training/imitate.py's Motion, number for number: the policy only
// means anything if the browser hands it the same reference it learned with. scripts/check-mimic.mjs
// compares the observation built from it with one written by Python.
//
// No browser APIs, so Node runs it in the checks.
import { idOf } from './sim.js';

// From training/imitate.py: the pelvis path is smoothed over 0.3 s (its video jitter would launch the
// robot), the joints over 0.1 s (MediaPipe's frame-to-frame jitter).
const SMOOTH_S = 0.3;
const JOINT_SMOOTH_S = 0.1;
// The feet: the spheres and capsules on the two ankle bodies. In scene_mjx.xml those are exactly the
// six collision capsules training uses (imitate.FOOT_SPHERES); in g1_kinematics.xml, the eight sole
// spheres the retargeting puts on the floor. So the same code grounds a reference for either model.
const FOOT_BODIES = ['left_ankle_roll_link', 'right_ankle_roll_link'];

function footGeoms(mujoco, model) {
  const bodies = FOOT_BODIES.map((name) => idOf(mujoco, model, 'BODY', name));
  const kinds = [mujoco.mjtGeom.mjGEOM_SPHERE.value, mujoco.mjtGeom.mjGEOM_CAPSULE.value];
  const out = [];
  for (let g = 0; g < model.ngeom; g++) if (bodies.includes(model.geom_bodyid[g]) && kinds.includes(model.geom_type[g])) out.push(g);
  return out;
}

// Python's round(): halves go to the even neighbor. Window sizes must match training's exactly.
function roundHalfEven(x) {
  const r = Math.round(x);
  return Math.abs(x % 1) === 0.5 && r % 2 !== 0 ? r - 1 : r;
}

const windowOf = (seconds, fps) => Math.max(1, roundHalfEven(seconds * fps));

// Centered moving average along time over columns [from, to) of rows, repeating the edges
// (imitate.smooth). Returns new rows for those columns only.
function smooth(rows, from, to, window) {
  const n = rows.length;
  const out = rows.map((r) => r.slice(from, to));
  if (window < 2) return out;
  const pad = Math.floor(window / 2);
  for (let c = from; c < to; c++) {
    for (let i = 0; i < n; i++) {
      let sum = 0;
      for (let k = i - pad; k < i - pad + window; k++) sum += rows[Math.min(Math.max(k, 0), n - 1)][c];
      out[i][c - from] = sum / window;
    }
  }
  return out;
}

// numpy.gradient along time: central differences inside, one-sided at the two ends.
function gradient(rows, dt) {
  const n = rows.length;
  return rows.map((row, i) => row.map((_, c) => {
    if (i === 0) return (rows[1][c] - rows[0][c]) / dt;
    if (i === n - 1) return (rows[n - 1][c] - rows[n - 2][c]) / dt;
    return (rows[i + 1][c] - rows[i - 1][c]) / (2 * dt);
  }));
}

/**
 * @param mujoco  the MuJoCo module
 * @param model   a model of the scene the policy was trained on (its feet decide the pelvis height)
 * @param motion  a RobotMotion: { clip_id, robot, fps, qpos: [frames][36] }
 * @returns { id, duration, sample(t) } sample gives { q, rootVel, jointVel } at t seconds
 */
export function createReference(mujoco, model, motion) {
  const fps = motion.fps;
  const dt = 1 / fps;
  const n = motion.qpos.length;
  const window = windowOf(SMOOTH_S, fps);
  const qpos = motion.qpos.map((r) => Float64Array.from(r));

  // 1. joints lightly smoothed; 2. pelvis path smoothed on the floor plane only.
  const joints = smooth(qpos, 7, qpos[0].length, windowOf(JOINT_SMOOTH_S, fps));
  const plane = smooth(qpos, 0, 2, window);
  qpos.forEach((r, i) => {
    r.set(joints[i], 7);
    r.set(plane[i], 0);
  });

  // 3. pelvis height set frame by frame so the lowest foot geom touches the floor (z = 0). A
  // capsule's lowest point is its center, minus half its length along its tilted axis, minus its
  // radius: exactly what mj_geomDistance gives against the floor plane in training. A sphere is a
  // capsule of length 0.
  const data = new mujoco.MjData(model);
  try {
    const feet = footGeoms(mujoco, model);
    for (const r of qpos) {
      data.qpos.set(r);
      mujoco.mj_kinematics(model, data);
      const xpos = data.geom_xpos;
      const xmat = data.geom_xmat;
      const size = model.geom_size;
      let lowest = Infinity;
      for (const g of feet) {
        const radius = size[3 * g];
        const half = size[3 * g + 1];
        lowest = Math.min(lowest, xpos[3 * g + 2] - half * Math.abs(xmat[9 * g + 8]) - radius);
      }
      r[2] -= lowest;
    }
  } finally {
    data.delete();
  }

  // Velocities by finite differences of smoothed signals (the grounded height still wobbles).
  const height = smooth(qpos, 2, 3, window);
  const rootVel = gradient(qpos.map((r, i) => [r[0], r[1], height[i][0]]), dt);
  const jointVel = gradient(smooth(qpos, 7, qpos[0].length, window), dt);

  const lerp = (rows, i, w) => rows[i].map((a, c) => (1 - w) * a + w * rows[i + 1][c]);
  return {
    id: motion.clip_id,
    duration: (n - 1) / fps,
    /** Pose (36), pelvis velocity in the world (3) and joint velocities (29) at time t (s). */
    sample(t) {
      const x = Math.min(Math.max(t * fps, 0), n - 1);
      const i = Math.min(Math.floor(x), n - 2);
      const w = x - i;
      const q = lerp(qpos, i, w);
      const norm = Math.hypot(q[3], q[4], q[5], q[6]);
      for (let k = 3; k < 7; k++) q[k] /= norm;
      return { q, rootVel: lerp(rootVel, i, w), jointVel: lerp(jointVel, i, w) };
    },
  };
}
