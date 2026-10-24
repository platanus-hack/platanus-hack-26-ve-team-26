// Headless check of an imitation policy, in Node with the same MuJoCo WASM and policy runtime the
// page uses (onnx-lite.js). training/browser_fixture.py recorded, for the first decisions of the clip, the robot's
// state, the observation Python built and the targets the network answered. Here the browser code
// (src/reference.js and src/policy.js) is put in each of those states and must build the same
// observation and get the same targets. If the observation differed, the robot would fall in the
// browser even though everything "runs".
// Run: npm run check
import { readFileSync } from 'node:fs';
import * as ort from '../src/onnx-lite.js'; // the page's runtime (check-onnx compares it with onnxruntime)
import { createPolicy } from '../src/policy.js';
import { loadG1Node } from './node-model.mjs';

const POLICIES = new URL('../../training/policies/', import.meta.url);
const MOTIONS = new URL('../motions/', import.meta.url);
const POLICY = 'g1-walk';
// The network reads float32, which keeps ~7 digits: inputs equal to 1e-4 are the same input. The
// fixture's states are rounded to 1e-9, so anything above that is a difference in how they are built.
const OBS_TOLERANCE = 1e-4;
// Targets in radians: 1e-3 rad is 0.06 degrees, far below what a motor of the G1 resolves.
const CTRL_TOLERANCE = 1e-3;
// A fall or a pelvis 0.6 m from the reference ends the run (training/imitate.py).
const FALL_HEIGHT = 0.5;
const MAX_ROOT_ERROR_M = 0.6;

const read = (url) => JSON.parse(readFileSync(url));
const meta = read(new URL(`${POLICY}.json`, POLICIES));
const fixture = read(new URL(`${POLICY}.fixture.json`, POLICIES));
const motion = read(new URL(`${meta.motion}.json`, MOTIONS));

const { sim } = await loadG1Node();
sim.load('scene_mjx.xml', 'home'); // the scene the policy was trained on
const policy = await createPolicy(ort, sim, new Uint8Array(readFileSync(new URL(`${POLICY}.onnx`, POLICIES))), meta, { motion });
sim.policy = policy;
const failures = [];
const expect = (ok, what) => {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${what}`);
  if (!ok) failures.push(what);
};
const maxDiff = (a, b) => a.reduce((m, v, i) => Math.max(m, Math.abs(v - b[i])), 0);

console.log(`the imitation policy (${POLICY}, ${meta.obs_dim} inputs, clip ${meta.motion})`);
let worstObs = 0;
let worstCtrl = 0;
let worstAt = 0;
const dt = sim.model.opt.timestep;
for (const s of fixture.samples) {
  sim.data.qpos.set(s.qpos);
  sim.data.qvel.set(s.qvel);
  policy.setPrevious(s.previous);
  sim.steps = Math.round(s.t / dt); // the policy's clock: one decision every 5 steps of 4 ms
  const obs = Array.from(policy.observe(sim.data, sim.steps * dt));
  const diff = maxDiff(obs, s.obs);
  if (diff > worstObs) [worstObs, worstAt] = [diff, obs.findIndex((v, i) => Math.abs(v - s.obs[i]) === diff)];
  await policy.act(sim);
  worstCtrl = Math.max(worstCtrl, maxDiff(Array.from(sim.data.ctrl), s.ctrl));
}
expect(worstObs < OBS_TOLERANCE, `same observation as Python in ${fixture.samples.length} states (worst ${worstObs.toExponential(1)}, at input ${worstAt})`);
expect(worstCtrl < CTRL_TOLERANCE, `same motor targets as Python (worst ${worstCtrl.toExponential(1)} rad)`);

// The policy driving the robot from the clip's first pose, as the page does. Reported, not asserted:
// the walk does not hold yet (training goes on), and this number is the one to watch.
sim.reset();
let followed = 0;
for (let t = 0; t < policy.duration; t += 0.02) {
  await sim.advance(0.02);
  const pelvis = sim.bodyPosition('pelvis');
  const reference = motion.qpos[Math.min(Math.round(policy.time(sim) * motion.fps), motion.qpos.length - 1)];
  if (pelvis[2] < FALL_HEIGHT || Math.hypot(pelvis[0] - reference[0], pelvis[1] - reference[1]) > MAX_ROOT_ERROR_M) break;
  followed = policy.time(sim);
}
console.log(`  info follows the clip ${followed.toFixed(1)} s of ${policy.duration.toFixed(1)} from its first pose (Python's evaluate_walk.py measures the same)`);

policy.dispose();
sim.delete();
if (failures.length) {
  console.error(`\ncheck-mimic failed: ${failures.length} of the checks above`);
  process.exit(1);
}
console.log('\ncheck-mimic passed');
