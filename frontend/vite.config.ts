import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react() // React plugin
  ],
  // Add server config to disable HMR
  server: {
    hmr: false
  },
  // Restore css and build config, add worker format
  css: {
    devSourcemap: true // Ensure CSS source maps are enabled in dev
  },
  build: {
    cssCodeSplit: false // Keep this from previous config
  },
  // Worker options should be at the top level
  worker: {
    format: 'es' // Specify ES module format for worker builds
  }
})
