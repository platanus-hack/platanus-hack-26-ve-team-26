// A trained policy (training/, exported to ONNX) driving the G1: it reads the robot's state, and
// every 20 ms writes the motor targets. It has to build the observation exactly as training/env.py
// does (observe), because the network only means anything for numbers laid out the way it learned.
//
// No browser APIs: `ort` is passed in, so Node runs the same code in scripts/check-policy.mjs.
import { idOf } from './sim.js';

// The policy decides every 5 physics steps: 20 ms with scene_mjx.xml's 4 ms step (training DECIMATION).
const DECIMATION = 5;
// The keyframe training starts from; its ctrl is the standing pose the observation is measured from.
const HOME_KEY = 'home';
// Observation scales, from training/env.py. They keep every input near [-1, 1].
const ANG_VEL_SCALE = 0.25;
const JOINT_VEL_SCALE = 0.05;
const ACTION_SCALE = 0.25; // one unit of action is 0.25 rad from the standing pose
const NU = 29;
const OBS_DIM = 3 + 3 + NU + NU + NU;

/**
 * @param ort    the onnxruntime-web module (or onnxruntime-node)
 * @param sim    the Simulation, already loaded with the scene the policy was trained on
 * @param onnx   the bytes of policy.onnx
 * @param meta   policy.json: { id, robot, mjcf, obs_dim, nu, steps, ... }
 */
export async function createPolicy(ort, sim, onnx, meta) {
  const { model } = sim;
  if (meta.robot !== 'unitree_g1' || meta.obs_dim !== OBS_DIM || meta.nu !== NU || model.nu !== NU) {
    throw new Error(`The policy ${meta.id} is not for this robot (${meta.robot}, ${meta.obs_dim} inputs, ${meta.nu} motors).`);
  }
  if (Math.abs(model.opt.timestep * DECIMATION - 0.02) > 1e-9) {
    throw new Error(`The policy decides every 20 ms; this scene steps ${model.opt.timestep * 1000} ms, so that is not ${DECIMATION} steps.`);
  }
  const session = await ort.InferenceSession.create(onnx, { executionProviders: ['wasm'] });
  const [input] = session.inputNames;
  const [output] = session.outputNames;

  // The standing pose: the motor targets of the home keyframe.
  const home = idOf(sim.mujoco, model, 'KEY', HOME_KEY);
  const standing = Float64Array.from(model.key_ctrl.subarray(home * NU, (home + 1) * NU));
  const previous = standing.slice(); // the targets of the last decision, as the next observation
  const obs = new Float32Array(OBS_DIM);

  // The 93 numbers, in the order of training/README.md.
  function observe({ qpos, qvel }) {
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
    return obs;
  }

  return {
    id: meta.id,
    steps: meta.steps,
    decimation: DECIMATION,
    observe,
    // Back to the standing pose as "the previous action": what training starts every episode with.
    reset: () => previous.set(standing),
    // One decision: the network's output already is the motor targets (it applies the scale and
    // clips to each motor's range), so it goes straight to ctrl.
    async act({ data }) {
      const result = await session.run({ [input]: new ort.Tensor('float32', observe(data), [1, OBS_DIM]) });
      const ctrl = result[output].data;
      data.ctrl.set(ctrl);
      previous.set(ctrl);
    },
    dispose: () => session.release(),
  };
}
