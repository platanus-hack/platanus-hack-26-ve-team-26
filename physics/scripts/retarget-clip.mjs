// PoseClip -> RobotMotion on disk.
// Run: npm run retarget -- ../data/clips/clip_x.json [more clips...] [--out <folder>]
// Writes <folder>/<clip_id>.json, the RobotMotion of docs/contrato.md, which training/ imitates and
// the web plays. The folder defaults to physics/motions/ (versioned, the preloaded clips); the video
// server passes its own data folder with --out, so users' clips never land in the repo.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { loadG1Node } from './node-model.mjs';
import { retargetClip } from '../src/motion.js';

const { values, positionals: paths } = parseArgs({
  options: { out: { type: 'string' } },
  allowPositionals: true,
});
const outDir = values.out ? resolve(values.out) : new URL('../motions/', import.meta.url).pathname;
if (!paths.length) {
  console.error('usage: npm run retarget -- <PoseClip.json> [more PoseClip.json...] [--out <folder>]');
  process.exit(1);
}

const { mujoco, sim } = await loadG1Node();
mkdirSync(outDir, { recursive: true });
for (const path of paths) {
  const clip = JSON.parse(readFileSync(path));
  const start = performance.now();
  const { motion, stats } = retargetClip(mujoco, sim.model, clip);
  const out = join(outDir, `${motion.clip_id}.json`);
  writeFileSync(out, JSON.stringify(motion));
  console.log(
    `${motion.clip_id}: ${stats.frames} frames in ${((performance.now() - start) / 1000).toFixed(1)} s, ` +
      `${(stats.tracked / stats.frames * 100).toFixed(0)}% tracked, ${(stats.reached * 100).toFixed(0)}% within reach, ` +
      `path scaled x${stats.scale.toFixed(2)} to ${stats.travel.toFixed(1)} m -> ${out}`,
  );
}
sim.delete();
