// Keeps the robot upright sideways. Seen from the side, a person's left-right axis is the camera's
// depth, MediaPipe's noisiest axis, and it comes with a bias: on data/clips' walk the retargeted
// G1 leaned 6 degrees sideways the whole clip (waist roll -6.5 degrees on average, both hips rolled
// ~8 degrees the same way and the ankles back), which showed as a crooked robot in the landing's
// Capture. A person walking sways a few degrees each step but is upright on average, so what is
// removed is the slow average of those rolls; the sway of each step stays.
//
// Only for what is shown (playClip, mimic): the RobotMotions in physics/motions are the references
// the policies were trained on, and stay as they are.
import { idOf } from './sim.js';

// The average is taken over 2 s: longer than a gait cycle (~1.1 s), so the step's own sway passes,
// short enough to follow a bias that drifts as the person turns.
export const LEVEL_WINDOW_S = 2;

function rollJoints(mujoco, model) {
  const adr = (name) => model.jnt_qposadr[idOf(mujoco, model, 'JOINT', name)];
  const data = new mujoco.MjData(model);
  const torso = idOf(mujoco, model, 'BODY', 'torso_link');
  return {
    hips: ['left_hip_roll_joint', 'right_hip_roll_joint'].map(adr),
    ankles: ['left_ankle_roll_joint', 'right_ankle_roll_joint'].map(adr),
    waist: adr('waist_roll_joint'),
    // The torso's sideways lean (rad, + to the robot's left), measured: with the waist also turned
    // and bent (jumping jacks), its roll joint alone is not the lean, and correcting it overshot.
    torsoLean(q) {
      data.qpos.set(q);
      mujoco.mj_kinematics(model, data);
      const up = [2, 5, 8].map((k) => data.xmat[9 * torso + k]);
      const yaw = 2 * Math.atan2(q[6], q[3]);
      return Math.asin(Math.max(-1, Math.min(1, -Math.sin(yaw) * up[0] + Math.cos(yaw) * up[1])));
    },
    delete: () => data.delete(),
  };
}

// The two biases of a pose: both legs rolled the same way (the hips' common roll; the hips' axes
// point the same way, so the same sign is the same direction), and the torso's sideways lean.
const biases = (q, j) => [(q[j.hips[0]] + q[j.hips[1]]) / 2, j.torsoLean(q)];

// Takes `lean` (the legs' common roll, the waist's roll) off a pose: the legs roll back and the
// ankles turn the other way by as much, so the soles stay as flat as they were.
function unlean(q, j, [legs, waist]) {
  for (const k of [0, 1]) {
    q[j.hips[k]] -= legs;
    q[j.ankles[k]] += legs;
  }
  q[j.waist] += waist; // the roll joint turns the torso toward the robot's right as it grows
}

/** Levels a whole clip (rows of qpos, written in place) with the centered 2 s average. */
export function levelClip(mujoco, model, rows, fps) {
  const j = rollJoints(mujoco, model);
  const raw = rows.map((q) => biases(q, j));
  const half = Math.max(1, Math.round((LEVEL_WINDOW_S * fps) / 2));
  rows.forEach((q, i) => {
    const a = Math.max(0, i - half);
    const b = Math.min(rows.length - 1, i + half);
    const mean = [0, 1].map((k) => raw.slice(a, b + 1).reduce((sum, r) => sum + r[k], 0) / (b - a + 1));
    unlean(q, j, mean);
  });
  j.delete();
}

/**
 * Levels live poses with a causal average of the last ~2 s.
 * @returns { level(qpos, t) -> qpos (written in place), delete() }
 */
export function createLeveler(mujoco, model) {
  const j = rollJoints(mujoco, model);
  let mean = null;
  let last = 0;
  const level = (q, t) => {
    const now = biases(q, j);
    if (!mean) mean = now;
    else {
      // An exponential average whose time constant is half the window: about as smooth.
      const k = 1 - Math.exp(-Math.max(0, t - last) / (LEVEL_WINDOW_S / 2));
      mean = mean.map((m, i) => m + k * (now[i] - m));
    }
    last = t;
    unlean(q, j, mean);
    return q;
  };
  return { level, delete: j.delete };
}
