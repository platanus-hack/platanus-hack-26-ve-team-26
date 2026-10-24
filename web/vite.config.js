import { defineConfig } from 'vite';

export default defineConfig({
  // Relative asset paths so dist/ works from any host and any subfolder, not only the domain root.
  base: './',
  resolve: {
    // tridi-physics is a link to ../physics, and npm does not install a linked package's
    // dependencies. Resolving these from web/node_modules makes a fresh install build, and
    // keeps a single copy of three.js. Their versions must match physics/package.json.
    dedupe: ['three', '@mujoco/mujoco'],
  },
});
