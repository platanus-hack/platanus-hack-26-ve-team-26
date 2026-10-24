// URLs of everything createSimView downloads: the MuJoCo WASM build and the G1 model files.
// The same imports as physics/src/load.js, so Vite gives them the same URLs and a prefetch here
// fills the browser cache that load.js then reads from.
import wasmUrl from '@mujoco/mujoco/mujoco.wasm?url';

const modelUrls = Object.values(
  import.meta.glob('../../physics/models/unitree_g1/**/*.{xml,STL}', { query: '?url', import: 'default', eager: true }),
);

export default [wasmUrl, ...modelUrls];
