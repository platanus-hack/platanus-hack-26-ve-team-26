// Browser loader: fetches the MuJoCo WASM build and every file of the G1 model,
// reporting progress, and returns a ready Simulation standing in its "stand" keyframe.
import loadMujoco from '@mujoco/mujoco';
import wasmUrl from '@mujoco/mujoco/mujoco.wasm?url';
import { Simulation } from './sim.js';

// URLs of the G1 MJCF and meshes. Vite serves them in dev and copies them on build.
const G1_ROOT = '../models/unitree_g1/';
const G1_FILES = import.meta.glob('../models/unitree_g1/**/*.{xml,STL}', {
  query: '?url',
  import: 'default',
  eager: true,
});

/**
 * @param onProgress called with { done, total, bytes } as each file arrives
 *   (the WASM build counts as one file).
 */
export async function loadG1(onProgress = () => {}) {
  const entries = Object.entries(G1_FILES);
  const progress = { done: 0, total: entries.length + 1, bytes: 0 };
  const advance = (bytes = 0) => {
    progress.done++;
    progress.bytes += bytes;
    onProgress({ ...progress });
  };
  onProgress({ ...progress });

  const mujocoReady = loadMujoco({ locateFile: () => wasmUrl }).then((mujoco) => {
    advance();
    return mujoco;
  });
  const files = {};
  await Promise.all(
    entries.map(async ([path, url]) => {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
      const bytes = new Uint8Array(await response.arrayBuffer());
      files[path.slice(G1_ROOT.length)] = bytes;
      advance(bytes.byteLength);
    }),
  );
  return new Simulation(await mujocoReady, files, 'scene.xml', 'stand');
}
