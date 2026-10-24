// Headless check of the physics, with the same WASM build the page uses:
// the G1 stands still for 10 s on its own, and a push knocks it over.
// Run: npm run check
import { loadG1Node } from './node-model.mjs';

const FRAME_S = 1 / 60;
// The "stand" keyframe puts the pelvis at 0.79 m. Below 0.70 m the knees or hips gave way;
// below 0.40 m the robot is on the floor.
const STANDING_MIN_Z = 0.7;
const FALLEN_MAX_Z = 0.4;

function run(sim, seconds) {
  let steps = 0;
  for (let t = 0; t < seconds; t += FRAME_S) steps += sim.advance(FRAME_S);
  return steps;
}

const { mujoco, sim } = await loadG1Node();
const mass = sim.model.body_mass.reduce((a, b) => a + b, 0);
console.log(`G1: nq=${sim.model.nq} nu=${sim.model.nu} mass=${mass.toFixed(1)} kg dt=${sim.model.opt.timestep * 1000} ms`);

let start = performance.now();
const steps = run(sim, 10);
const wall = (performance.now() - start) / 1000;
const standZ = sim.bodyPosition('pelvis')[2];
console.log(`stand 10 s: pelvis z=${standZ.toFixed(3)} m, ${steps} steps, ${(steps / wall).toFixed(0)} steps/s (x${(10 / wall).toFixed(1)} real time)`);

sim.reset();
run(sim, 0.5);
sim.push();
run(sim, 3);
const pushedZ = sim.bodyPosition('pelvis')[2];
console.log(`push + 3 s: pelvis z=${pushedZ.toFixed(3)} m`);

const failures = [];
if (standZ < STANDING_MIN_Z) failures.push(`fell while standing (pelvis ${standZ.toFixed(3)} m < ${STANDING_MIN_Z})`);
if (pushedZ > FALLEN_MAX_Z) failures.push(`did not fall when pushed (pelvis ${pushedZ.toFixed(3)} m > ${FALLEN_MAX_Z})`);
sim.delete();
if (failures.length) {
  console.error(`check failed: ${failures.join('; ')}`);
  process.exit(1);
}
console.log('check passed');
