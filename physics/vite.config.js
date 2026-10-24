import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

// The dev page imports the camera module from data/live (tridi-live). Its own folder has no
// node_modules in a fresh clone or in the deploy, so MediaPipe is resolved from this package.
export default defineConfig({
  resolve: {
    alias: {
      '@mediapipe/tasks-vision': fileURLToPath(new URL('./node_modules/@mediapipe/tasks-vision', import.meta.url)),
    },
  },
});
