import { defineConfig } from 'vite';

// Relative asset paths so dist/ works from any host and any subfolder, not only the domain root.
export default defineConfig({ base: './' });
