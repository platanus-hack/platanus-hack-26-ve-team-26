// PoseClip -> RobotMotion on disk.
// Run: npm run retarget -- ../data/clips/clip_x.json [more clips...]
// Writes physics/motions/<clip_id>.json, the RobotMotion of docs/contrato.md, which training/
// imitates and the web plays.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { loadG1Node } from './node-model.mjs';
import { retargetClip } from '../src/motion.js';

const OUT_DIR = new URL('../motions/', import.meta.url).pathname;
const paths = process.argv.slice(2);
if (!paths.length) {
  console.error('usage: npm run retarget -- <PoseClip.json> [more PoseClip.json...]');
  process.exit(1);
}

const { mujoco, sim } = await loadG1Node();
mkdirSync(OUT_DIR, { recursive: true });
for (const path of paths) {
  const clip = JSON.parse(readFileSync(path));
  const start = performance.now();
  const { motion, stats } = retargetClip(mujoco, sim.model, clip);
  const out = `${OUT_DIR}${motion.clip_id}.json`;
  writeFileSync(out, JSON.stringify(motion));
  console.log(
    `${motion.clip_id}: ${stats.frames} frames in ${((performance.now() - start) / 1000).toFixed(1)} s, ` +
      `${(stats.tracked / stats.frames * 100).toFixed(0)}% tracked, ${(stats.reached * 100).toFixed(0)}% within reach, ` +
      `path scaled x${stats.scale.toFixed(2)} to ${stats.travel.toFixed(1)} m -> ${out}`,
  );
}
sim.delete();
