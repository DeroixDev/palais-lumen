import { defineConfig } from 'vite';

// Tauri sets TAURI_ENV_PLATFORM when it runs `npm run dev`/`npm run build` for the desktop app.
const tauri = !!process.env.TAURI_ENV_PLATFORM;

// Relative base so the build also works from a subfolder or as a packaged desktop app.
export default defineConfig({
  base: './',
  build: { chunkSizeWarningLimit: 2000 },
  // tauri.conf.json points devUrl at 5173, so don't silently fall back to another port.
  server: tauri ? { port: 5173, strictPort: true } : undefined,
  clearScreen: !tauri,
});
