import { defineConfig } from 'vite';

export default defineConfig({
  // Relative asset paths so dist/ works from any host and any subfolder, not only the domain root.
  base: './',
  resolve: {
    // tridi-physics and tridi-live are links to ../physics and ../data/live, and npm does not
    // install a linked package's dependencies. Resolving these from web/node_modules makes a
    // fresh install build, and keeps a single copy of three.js. Their versions must match
    // physics/package.json and data/live/package.json.
    dedupe: ['three', '@mujoco/mujoco', '@mediapipe/tasks-vision', 'onnxruntime-web'],
  },
});
