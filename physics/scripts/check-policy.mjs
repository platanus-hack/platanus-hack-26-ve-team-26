// Headless check of the trained policy on the G1, in Node with the same MuJoCo WASM and the same
// onnxruntime-web the page uses: it must build training's observation exactly, or the robot falls.
// Run: npm run check
import { readFileSync } from 'node:fs';
import * as ort from 'onnxruntime-web';
import { createPolicy } from '../src/policy.js';
import { loadG1Node } from './node-model.mjs';

const POLICIES = new URL('../../training/policies/', import.meta.url);
const FRAME_S = 1 / 60;
// A fall: pelvis below 0.5 m, the training's own threshold (training/env.py FALL_HEIGHT).
const FALL_HEIGHT = 0.5;
// training/README.md measured for g1-stand (v2, 40 M steps), over 5 starts of 20 s: it stands all
// 20 s and holds the four shoves (front, left, back, right) up to 250 N, the web button's force.
const STAND_SECONDS = 20;
const PUSH_AT = 4;
const SIDES = [['front', 0], ['left', Math.PI / 2], ['back', Math.PI], ['right', -Math.PI / 2]];

const { sim } = await loadG1Node();
sim.load('scene_mjx.xml', 'home'); // the scene the policy was trained on
const failures = [];
const expect = (ok, what) => {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${what}`);
  if (!ok) failures.push(what);
};

async function policy(name) {
  const meta = JSON.parse(readFileSync(new URL(`${name}.json`, POLICIES)));
  return createPolicy(ort, sim, new Uint8Array(readFileSync(new URL(`${name}.onnx`, POLICIES))), meta);
}

// Runs the robot for `seconds` and returns when it fell (s), or null if it stayed up.
async function run(seconds, { pushAt, angle = 0, newtons } = {}) {
  sim.reset();
  let pushed = false;
  for (let t = 0; t < seconds; t += FRAME_S) {
    if (pushAt !== undefined && !pushed && t >= pushAt) {
      sim.push(angle, newtons);
      pushed = true;
    }
    await sim.advance(FRAME_S);
    if (sim.bodyPosition('pelvis')[2] < FALL_HEIGHT) return t;
  }
  return null;
}

const ids = Object.fromEntries(['g1-stand', 'g1-stand-step-0'].map((n) => [n, null]));
for (const name of Object.keys(ids)) ids[name] = await policy(name);

console.log('the trained policy (g1-stand)');
sim.policy = ids['g1-stand'];
{
  const fell = await run(STAND_SECONDS);
  expect(fell === null, `stands ${STAND_SECONDS} s with no pushes${fell === null ? '' : ` (fell at ${fell.toFixed(1)} s)`}`);
  expect(Math.abs(sim.bodyPosition('pelvis')[2] - 0.78) < 0.05, `pelvis at ${sim.bodyPosition('pelvis')[2].toFixed(2)} m, standing height`);
}
for (const [newtons, atLeast] of [[150, 4], [250, 4]]) {
  const held = [];
  for (const [side, angle] of SIDES) if ((await run(STAND_SECONDS, { pushAt: PUSH_AT, angle, newtons })) === null) held.push(side);
  expect(held.length >= atLeast, `takes a ${newtons} N shove from ${held.length} of 4 sides, at least ${atLeast} (${held.join(', ') || 'none'})`);
}

console.log('knocked down, the trained policy lies still (it never saw the floor in training)');
sim.policy = ids['g1-stand'];
{
  sim.reset();
  // A shove far past what it can take (600 N from behind), then 2 s on the floor before measuring.
  let fellAt = null;
  let motion = 0;
  let frames = 0;
  for (let t = 0; t < 6; t += FRAME_S) {
    if (t >= 1 && t < 1 + FRAME_S) sim.push(Math.PI, 600);
    await sim.advance(FRAME_S);
    if (fellAt === null && sim.bodyPosition('pelvis')[2] < FALL_HEIGHT) fellAt = t;
    if (fellAt !== null && t > fellAt + 2) {
      let squared = 0;
      for (let i = 6; i < sim.model.nv; i++) squared += sim.data.qvel[i] ** 2;
      motion += Math.sqrt(squared);
      frames++;
    }
  }
  const speed = frames ? motion / frames : 0;
  // Still means joint speeds under 1 rad/s overall; without the fix it flailed at ~55 rad/s.
  expect(fellAt !== null && speed < 1, `falls and lies still: joints at ${speed.toFixed(2)} rad/s on the floor`);
}

console.log('the untrained policy (g1-stand-step-0), to show the check can fail');
sim.policy = ids['g1-stand-step-0'];
{
  const fell = await run(STAND_SECONDS);
  expect(fell !== null && fell < 3, `falls within 3 s (fell at ${fell === null ? 'never' : fell.toFixed(1) + ' s'})`);
}

for (const p of Object.values(ids)) p.dispose();
sim.delete();
if (failures.length) {
  console.error(`\ncheck-policy failed: ${failures.length} of the checks above`);
  process.exit(1);
}
console.log('\ncheck-policy passed');
