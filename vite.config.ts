import { defineConfig } from 'vite';

// Relative base so the build also works from a subfolder or as a packaged desktop app.
export default defineConfig({
  base: './',
  build: { chunkSizeWarningLimit: 2000 },
});
