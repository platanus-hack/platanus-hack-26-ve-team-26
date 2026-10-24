// Checks that onnx-lite.js (the page's own runner of the policies' networks) gives what
// onnxruntime gives, for every policy in training/policies, on random observations around the
// ones the robot sees. Run: npm run check
import { readdirSync, readFileSync } from 'node:fs';
import * as ort from 'onnxruntime-web';
import * as lite from '../src/onnx-lite.js';

// float32 through four layers: the two runtimes add in different orders, so they may differ in the
// last bits. A motor target 1e-5 rad apart is nothing the robot can show.
const MAX_DIFF = 1e-5;
const SAMPLES = 50;

const dir = new URL('../../training/policies/', import.meta.url);
let failed = false;
for (const file of readdirSync(dir).filter((f) => f.endsWith('.onnx'))) {
  const bytes = new Uint8Array(readFileSync(new URL(file, dir)));
  const [a, b] = await Promise.all([ort.InferenceSession.create(bytes), lite.InferenceSession.create(bytes)]);
  const dim = JSON.parse(readFileSync(new URL(file.replace('.onnx', '.json'), dir))).obs_dim;
  let worst = 0;
  for (let s = 0; s < SAMPLES; s++) {
    const obs = Float32Array.from({ length: dim }, () => (Math.random() - 0.5) * 4);
    const ra = await a.run({ [a.inputNames[0]]: new ort.Tensor('float32', obs, [1, dim]) });
    const rb = await b.run({ [b.inputNames[0]]: new lite.Tensor('float32', obs, [1, dim]) });
    const x = ra[a.outputNames[0]].data;
    const y = rb[b.outputNames[0]].data;
    if (x.length !== y.length) worst = Infinity;
    for (let i = 0; i < x.length; i++) worst = Math.max(worst, Math.abs(x[i] - y[i]));
  }
  const ok = worst <= MAX_DIFF;
  failed ||= !ok;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${file}: onnx-lite within ${worst.toExponential(1)} rad of onnxruntime (${SAMPLES} observations), at most ${MAX_DIFF}`);
}
if (failed) process.exit(1);
console.log('\ncheck-onnx passed');
