// Downsamples the training logs of the stand policy (training/policies/*-progress.csv) into the
// small curve the landing draws: seconds the G1 stays up per episode, against training steps.
// The second run (v2) continues the first one, so its steps are shifted by the first run's last.
//   node scripts/make-training-curve.mjs
import { readFileSync, writeFileSync } from 'node:fs';

const POINTS = 160;
const read = (file) =>
  readFileSync(new URL(`../../training/policies/${file}`, import.meta.url), 'utf8')
    .trim()
    .split('\n')
    .slice(1)
    .map((line) => line.split(',').map(Number)); // step, seconds, reward_per_step, episode_s, falls, steps_per_s

const v1 = read('g1-stand-progress.csv');
const v2 = read('g1-stand-v2-progress.csv');
const offset = v1.at(-1)[0];
const rows = [...v1, ...v2.map(([step, ...rest]) => [step + offset, ...rest])];

const total = rows.at(-1)[0];
const buckets = Array.from({ length: POINTS }, () => ({ sum: 0, n: 0 }));
for (const [step, , , episode] of rows) {
  if (Number.isNaN(episode)) continue; // "nan": no episode ended in that logging window
  const bucket = buckets[Math.min(POINTS - 1, Math.floor((step / total) * POINTS))];
  bucket.sum += episode;
  bucket.n += 1;
}
const points = buckets
  .map(({ sum, n }, i) => n && [+(((i + 0.5) / POINTS) * total / 1e6).toFixed(2), +(sum / n).toFixed(2)])
  .filter(Boolean);

const curve = {
  source: 'training/policies/g1-stand-progress.csv + g1-stand-v2-progress.csv',
  steps: total,
  minutes: Math.round((v1.at(-1)[1] + v2.at(-1)[1]) / 60),
  episodeCap: 20,
  secondRunAt: +(offset / 1e6).toFixed(2),
  points, // [millions of steps, mean seconds up per episode]
};
writeFileSync(new URL('../src/landing/training-curve.json', import.meta.url), `${JSON.stringify(curve)}\n`);
console.log(`${points.length} points, ${(total / 1e6).toFixed(1)} M steps, ${curve.minutes} min`);
