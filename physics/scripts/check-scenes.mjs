// Headless check of the places (physics/scenes/*.json, src/scenes.js): each one loads on the
// policy's scene, its loose objects rest on the floor instead of falling through it, the robot
// still stands with its policy, and the robot really collides with a place: shoved into a wall it
// touches it, and shoved into a loose box it moves it. Run: npm run check
import { readdirSync, readFileSync } from 'node:fs';
import * as ort from 'onnxruntime-web';
import { createPolicy } from '../src/policy.js';
import { placeXml } from '../src/scenes.js';
import { loadG1Node } from './node-model.mjs';

const SCENES_DIR = new URL('../scenes/', import.meta.url);
const POLICIES = new URL('../../training/policies/', import.meta.url);
const BASE = 'scene_mjx.xml';
const FRAME_S = 1 / 60;
const FALL_HEIGHT = 0.5; // training/env.py FALL_HEIGHT
// A loose object at rest sits with its center at half its height; 2 cm off means it sank or bounced.
const REST_M = 0.02;

const { sim, mujoco } = await loadG1Node();
const meta = JSON.parse(readFileSync(new URL('g1-stand.json', POLICIES)));
const onnx = new Uint8Array(readFileSync(new URL('g1-stand.onnx', POLICIES)));
const text = (file) => new TextDecoder().decode(sim.files[file]);
const failures = [];
const expect = (ok, what) => {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${what}`);
  if (!ok) failures.push(what);
};

// Loads `place` on the policy's scene, as view.setScene does, with the standing policy driving.
async function load(place) {
  const name = `place_${place.id}_${BASE}`;
  sim.files[name] = new TextEncoder().encode(placeXml(text(BASE), text('g1_mjx.xml'), place));
  sim.load(name, 'home');
  sim.policy = await createPolicy(ort, sim, onnx, meta);
  sim.reset();
}
const geom = (name) => mujoco.mj_name2id(sim.model, mujoco.mjtObj.mjOBJ_GEOM.value, name);
const run = async (seconds) => {
  for (let t = 0; t < seconds; t += FRAME_S) await sim.advance(FRAME_S);
};

const places = readdirSync(SCENES_DIR).filter((f) => f.endsWith('.json')).map((f) => JSON.parse(readFileSync(new URL(f, SCENES_DIR))));
for (const place of places) {
  console.log(`${place.title} (${place.objects.length} objects)`);
  await load(place);
  const loose = place.objects.filter((o) => o.movable);
  expect(sim.model.nq === 36 + 7 * loose.length, `loads: the robot's 36 values plus 7 per loose object (${sim.model.nq})`);
  await run(2);
  expect(sim.bodyPosition('pelvis')[2] > FALL_HEIGHT, `the robot stands 2 s with its policy (pelvis at ${sim.bodyPosition('pelvis')[2].toFixed(2)} m)`);
  const off = place.objects.map((o, i) => (o.movable ? Math.abs(sim.bodyPosition(`place_${i}_${o.label}_body`)[2] - o.size[2] / 2) : 0));
  expect(Math.max(...off) < REST_M, `loose objects rest on the floor (worst ${(100 * Math.max(...off)).toFixed(1)} cm off)`);
}

console.log('the robot collides with a place');
// Shoves the robot forward (it faces +x) with 250 N, the web button, and reports what it touched.
async function shove(target) {
  await run(0.5);
  let touched = false;
  sim.push(0, 250);
  for (let t = 0; t < 2; t += FRAME_S) {
    await sim.advance(FRAME_S);
    const contacts = sim.data.contact; // a vector of MjContact in the WASM build
    for (let i = 0; i < sim.data.ncon; i++) {
      const contact = contacts.get(i);
      if (Array.from(contact.geom).includes(target)) touched = true;
      contact.delete?.();
    }
  }
  return touched;
}
{
  await load({ id: 'pared', objects: [{ label: 'pared', kind: 'box', size: [0.1, 1.2, 1.5], pos: [0.4, 0], yaw: 0 }] });
  expect(await shove(geom('place_0_pared')), 'shoved toward a wall 0.4 m ahead, the robot hits it instead of going through');
}
{
  await load({ id: 'caja', objects: [{ label: 'caja', kind: 'box', size: [0.4, 0.4, 0.4], pos: [0.45, 0], yaw: 0, movable: true, mass: 2 }] });
  const before = sim.bodyPosition('place_0_caja_body');
  const touched = await shove(geom('place_0_caja'));
  const moved = Math.hypot(...sim.bodyPosition('place_0_caja_body').slice(0, 2).map((v, k) => v - before[k]));
  expect(touched && moved > 0.05, `shoved toward a 2 kg box at its feet, the robot moves it ${(100 * moved).toFixed(0)} cm`);
}

sim.policy?.dispose();
sim.delete();
if (failures.length) {
  console.error(`\ncheck-scenes failed: ${failures.length} of the checks above`);
  process.exit(1);
}
console.log('\ncheck-scenes passed');
