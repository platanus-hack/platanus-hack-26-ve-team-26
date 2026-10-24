// Headless check of the worlds (physics/worlds/*.json, SIM-3 in docs/plan-producto.md): each one
// loads, and its floor grip, mass, motor strength and wind reach MuJoCo as its file says. It also
// reports how long today's policy (trained only on flat ground) stands in each world; that is
// information, not a requirement: measuring robustness for real is SIM-5, with a policy trained
// on these worlds. Run: npm run check
import { readdirSync, readFileSync } from 'node:fs';
import * as ort from '../src/onnx-lite.js'; // the page's runtime (check-onnx compares it with onnxruntime)
import { createPolicy } from '../src/policy.js';
import { middleValues, sceneFile, WORLD_ORDER } from '../src/worlds.js';
import { loadG1Node } from './node-model.mjs';

const WORLDS_DIR = new URL('../worlds/', import.meta.url);
const POLICIES = new URL('../../training/policies/', import.meta.url);
const FRAME_S = 1 / 60;
const STAND_SECONDS = 10;
const FALL_HEIGHT = 0.5; // training/env.py FALL_HEIGHT
const close = (a, b) => Math.abs(a - b) < 1e-6;

const worlds = readdirSync(WORLDS_DIR)
  .filter((f) => f.endsWith('.json'))
  .map((f) => JSON.parse(readFileSync(new URL(f, WORLDS_DIR))));
const { sim, mujoco } = await loadG1Node();
const meta = JSON.parse(readFileSync(new URL('g1-stand.json', POLICIES)));
const onnx = new Uint8Array(readFileSync(new URL('g1-stand.onnx', POLICIES)));
const failures = [];
const expect = (ok, what) => {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${what}`);
  if (!ok) failures.push(what);
};

expect(
  worlds.length === WORLD_ORDER.length && WORLD_ORDER.every((id) => worlds.some((w) => w.id === id)),
  `the worlds are ${WORLD_ORDER.join(', ')}`,
);

for (const world of worlds.sort((a, b) => WORLD_ORDER.indexOf(a.id) - WORLD_ORDER.indexOf(b.id))) {
  console.log(`${world.id} (${world.scene})`);
  for (const key of ['friction', 'wind_mps', 'mass_scale', 'motor_scale', 'push_n']) {
    const range = world[key];
    expect(Array.isArray(range) && range.length === 2 && range[0] <= range[1], `${key} is a [min, max] range: ${JSON.stringify(range)}`);
  }
  expect(typeof world.title === 'string' && typeof world.why === 'string', `has a title and its why: ${world.title}`);
  sim.load(sceneFile(world), 'home');
  const baseMass = Array.from(sim.model.body_mass).reduce((a, b) => a + b, 0);
  const baseKp = sim.model.actuator_gainprm[0];
  const values = middleValues(world);
  sim.applyWorld(values);
  const { model, data } = sim;
  const floor = mujoco.mj_name2id(model, mujoco.mjtObj.mjOBJ_GEOM.value, 'floor');
  const pair = Array.from({ length: model.npair }, (_, p) => p).find((p) => model.pair_geom1[p] === floor || model.pair_geom2[p] === floor);
  expect(close(model.pair_friction[5 * pair], values.friction), `floor grip ${model.pair_friction[5 * pair].toFixed(2)}`);
  const mass = Array.from(model.body_mass).reduce((a, b) => a + b, 0);
  expect(close(mass / baseMass, values.mass_scale), `mass ${mass.toFixed(1)} kg (x${values.mass_scale.toFixed(2)})`);
  expect(close(model.actuator_gainprm[0] / baseKp, values.motor_scale), `motor stiffness x${values.motor_scale.toFixed(2)}`);
  const wind = Math.hypot(data.xfrc_applied[6 * sim.pushBodyId], data.xfrc_applied[6 * sim.pushBodyId + 1]);
  expect(close(wind, values.wind_newtons), `wind ${wind.toFixed(0)} N on the torso`);
  if (world.scene.includes('stones')) expect(model.nhfield === 1, 'stones: a height field on the floor');

  sim.policy = await createPolicy(ort, sim, onnx, meta);
  sim.reset();
  let fell = null;
  for (let t = 0; t < STAND_SECONDS && fell === null; t += FRAME_S) {
    await sim.advance(FRAME_S);
    if (sim.bodyPosition('pelvis')[2] < FALL_HEIGHT) fell = t;
  }
  console.log(`  info today's policy (flat-ground training) ${fell === null ? `stands ${STAND_SECONDS} s` : `falls at ${fell.toFixed(1)} s`}`);
  if (world.id === 'plano') expect(fell === null, `the policy stands ${STAND_SECONDS} s on the flat world it was trained on`);
  sim.policy.dispose();
}

sim.delete();
if (failures.length) {
  console.error(`\ncheck-worlds failed: ${failures.length} of the checks above`);
  process.exit(1);
}
console.log('\ncheck-worlds passed');
