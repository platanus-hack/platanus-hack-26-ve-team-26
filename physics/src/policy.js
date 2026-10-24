// A trained policy (training/, exported to ONNX) driving the G1: it reads the robot's state, and
// every 20 ms writes the motor targets. It has to build the observation exactly as training does
// (env.py observe for standing, imitate.py MimicEnv.observe for imitation), because the network only
// means anything for numbers laid out the way it learned.
//
// No browser APIs: `ort` is passed in, so Node runs the same code in scripts/check-policy.mjs and
// scripts/check-mimic.mjs.
import { createReference } from './reference.js';
import { idOf } from './sim.js';

// The policy decides every 5 physics steps: 20 ms with scene_mjx.xml's 4 ms step (training DECIMATION).
const DECIMATION = 5;
const CONTROL_DT = 0.02;
// The keyframe training starts from; its ctrl is the standing pose the observation is measured from.
const HOME_KEY = 'home';
// Observation scales, from training/env.py. They keep every input near [-1, 1].
const ANG_VEL_SCALE = 0.25;
const JOINT_VEL_SCALE = 0.05;
const ACTION_SCALE = 0.25; // one unit of action is 0.25 rad from the standing pose
const NU = 29;
const STAND_OBS = 3 + 3 + NU + NU + NU;
// Imitation adds the reference 20 ms ahead (joints, pelvis velocity, pelvis height) and, for each
// look-ahead instant of policy.json, its joints and pelvis position (imitate.MimicEnv.observe).
const mimicObsDim = (lookahead) => STAND_OBS + NU + 3 + 1 + lookahead.length * (NU + 3);
// A fall, as training ends an episode (env.py): pelvis below 0.5 m or the torso tilted past 60
// degrees. An imitation policy that falls starts its clip over after FALL_PAUSE_S, long enough to
// see the fall and short enough that the robot is not left lying on the floor for the rest of the clip.
const FALL_HEIGHT = 0.5;
const FALL_UPRIGHT = 0.5;
const FALL_PAUSE_S = 1;
// A fallen robot is outside everything the policy saw (training ends the episode at the fall), so
// its outputs there are noise: the trained g1-stand, knocked down, swung its joints at ~55 rad/s on
// the floor. Once fallen, the network stops deciding and the motors hold the pose it landed in,
// until a reset stands it up. It takes back over only if the robot is clearly up again, with some
// margin over the fall line so it does not flicker at the edge.
const RECOVER_HEIGHT = 0.6;

/**
 * @param ort    the onnxruntime-web module (or onnxruntime-node)
 * @param sim    the Simulation, already loaded with the scene the policy was trained on
 * @param onnx   the bytes of policy.onnx
 * @param meta   policy.json: { id, robot, mjcf, obs_dim, nu, steps, task?, motion?, lookahead_s?, ... }
 * @param options.motion  the RobotMotion an imitation policy follows (the clip of policy.json's `motion`)
 */
export async function createPolicy(ort, sim, onnx, meta, { motion } = {}) {
  const { model } = sim;
  const mimic = meta.task === 'mimic' || (meta.task === undefined && meta.obs_dim !== STAND_OBS);
  const lookahead = meta.lookahead_s ?? [];
  const obsDim = mimic ? mimicObsDim(lookahead) : STAND_OBS;
  if (meta.robot !== 'unitree_g1' || meta.obs_dim !== obsDim || meta.nu !== NU || model.nu !== NU) {
    throw new Error(`The policy ${meta.id} is not for this robot (${meta.robot}, ${meta.obs_dim} inputs, ${meta.nu} motors).`);
  }
  if (Math.abs(model.opt.timestep * DECIMATION - CONTROL_DT) > 1e-9) {
    throw new Error(`The policy decides every 20 ms; this scene steps ${model.opt.timestep * 1000} ms, so that is not ${DECIMATION} steps.`);
  }
  if (mimic && !motion) throw new Error(`The policy ${meta.id} imitates a clip: pass its RobotMotion ({ motion }).`);
  const wanted = meta.motion ?? meta.trained_on?.[0];
  if (mimic && wanted && motion.clip_id !== wanted) {
    throw new Error(`The policy ${meta.id} learned the clip ${wanted}, not ${motion.clip_id}.`);
  }
  const reference = mimic ? createReference(sim.mujoco, model, motion) : null;
  const session = await ort.InferenceSession.create(onnx, { executionProviders: ['wasm'] });
  const [input] = session.inputNames;
  const [output] = session.outputNames;

  // The standing pose: the motor targets of the home keyframe.
  const home = idOf(sim.mujoco, model, 'KEY', HOME_KEY);
  const standing = Float64Array.from(model.key_ctrl.subarray(home * NU, (home + 1) * NU));
  const previous = standing.slice(); // the targets of the last decision, as the next observation
  const obs = new Float32Array(obsDim);

  // The 93 numbers of standing, in the order of training/README.md.
  function observeStand({ qpos, qvel }) {
    // Angular velocity of the pelvis in its own frame (a free joint reports it that way).
    for (let i = 0; i < 3; i++) obs[i] = qvel[3 + i] * ANG_VEL_SCALE;
    // Gravity seen from the pelvis: R^T (0, 0, -1), with qpos[3:7] = (w, x, y, z).
    const [w, x, y, z] = [qpos[3], qpos[4], qpos[5], qpos[6]];
    obs[3] = -2 * (x * z - w * y);
    obs[4] = -2 * (y * z + w * x);
    obs[5] = -(1 - 2 * (x * x + y * y));
    for (let i = 0; i < NU; i++) {
      obs[6 + i] = qpos[7 + i] - standing[i];
      obs[6 + NU + i] = qvel[6 + i] * JOINT_VEL_SCALE;
      obs[6 + 2 * NU + i] = (previous[i] - standing[i]) / ACTION_SCALE;
    }
  }

  // Imitation at clip time t: the 93, then what the reference asks for 20 ms ahead and at each
  // look-ahead instant. Vectors from the world go to the pelvis frame with R^T (MuJoCo's quat2Mat).
  function observeMimic({ qpos, qvel }, t) {
    observeStand({ qpos, qvel });
    const [w, x, y, z] = [qpos[3], qpos[4], qpos[5], qpos[6]];
    const R = [
      1 - 2 * (y * y + z * z), 2 * (x * y - w * z), 2 * (x * z + w * y),
      2 * (x * y + w * z), 1 - 2 * (x * x + z * z), 2 * (y * z - w * x),
      2 * (x * z - w * y), 2 * (y * z + w * x), 1 - 2 * (x * x + y * y),
    ];
    const toBody = (v, k) => R[k] * v[0] + R[3 + k] * v[1] + R[6 + k] * v[2]; // (R^T v)[k]
    let at = STAND_OBS;
    const next = reference.sample(t + CONTROL_DT);
    for (let i = 0; i < NU; i++) obs[at++] = next.q[7 + i] - standing[i];
    for (let k = 0; k < 3; k++) obs[at++] = toBody(next.rootVel, k);
    obs[at++] = next.q[2] - qpos[2];
    for (const s of lookahead) {
      const { q } = reference.sample(t + s);
      for (let i = 0; i < NU; i++) obs[at++] = q[7 + i] - standing[i];
      const offset = [q[0] - qpos[0], q[1] - qpos[1], q[2] - qpos[2]];
      for (let k = 0; k < 3; k++) obs[at++] = toBody(offset, k);
    }
  }

  // Clip time of an imitation policy: one decision is 20 ms of the clip (MimicEnv.t).
  const clipTime = (sim) => sim.steps * model.opt.timestep;
  let fellAt = null; // clip time of the fall, while an imitation policy lies on the floor
  let down = false; // fallen: the network is not deciding (see RECOVER_HEIGHT)

  // Starts the clip over at its end, or a moment after a fall. True if it did (sim.reset() was called).
  function startOver(sim, t) {
    const { qpos } = sim.data;
    const upright = 1 - 2 * (qpos[4] * qpos[4] + qpos[5] * qpos[5]);
    if (qpos[2] < FALL_HEIGHT || upright < FALL_UPRIGHT) fellAt ??= t;
    if (t < reference.duration && (fellAt === null || t - fellAt < FALL_PAUSE_S)) return false;
    sim.reset();
    return true;
  }

  function observe(data, t = 0) {
    if (mimic) observeMimic(data, t);
    else observeStand(data);
    return obs;
  }

  return {
    id: meta.id,
    steps: meta.steps,
    task: mimic ? 'mimic' : 'stand',
    decimation: DECIMATION,
    observe,
    /** Seconds into the clip an imitation policy is at (0 for standing): to sync what is drawn beside. */
    time: (sim) => (mimic ? clipTime(sim) : 0),
    duration: reference?.duration ?? 0,
    // Standing: back to the standing pose as "the previous action", as training starts every
    // episode. Imitation: the robot is put in the clip's first pose with its velocities and holds
    // it (MimicEnv.reset_at(0)); sim.reset() runs mj_forward after this.
    reset(sim) {
      down = false;
      if (!mimic) return void previous.set(standing);
      fellAt = null;
      const { data } = sim;
      const { q, rootVel, jointVel } = reference.sample(0);
      data.qpos.set(q);
      data.qvel.fill(0);
      data.qvel.set(rootVel, 0);
      data.qvel.set(jointVel, 6);
      previous.set(q.slice(7));
      data.ctrl.set(previous);
    },
    // One decision: the network's output already is the motor targets (it adds the reference or
    // the standing pose, applies the scale and clips to each motor's range), so it goes straight
    // to ctrl. An imitation policy starts its clip over when it ends, or a moment after a fall.
    async act(sim) {
      const { data } = sim;
      const t = clipTime(sim);
      if (mimic && startOver(sim, t)) return;
      const { qpos } = data;
      const upright = 1 - 2 * (qpos[4] * qpos[4] + qpos[5] * qpos[5]);
      if (qpos[2] < FALL_HEIGHT || upright < FALL_UPRIGHT) {
        if (!down) {
          down = true;
          // Hold where it landed: each motor's target is its joint's current angle.
          for (let i = 0; i < NU; i++) data.ctrl[i] = qpos[7 + i];
        }
        return;
      }
      if (down && qpos[2] < RECOVER_HEIGHT) return;
      down = false;
      const result = await session.run({ [input]: new ort.Tensor('float32', observe(data, t), [1, obsDim]) });
      const ctrl = result[output].data;
      data.ctrl.set(ctrl);
      previous.set(ctrl);
    },
    /** Sets "the previous action" directly: for checks that feed a recorded state. */
    setPrevious: (ctrl) => previous.set(ctrl),
    dispose: () => session.release(),
  };
}
