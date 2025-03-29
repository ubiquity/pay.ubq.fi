import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react() // React plugin
  ],
  server: {
    hmr: false // Disable HMR globally
    // Removed watch config as HMR is disabled
  },
  css: {
    devSourcemap: true // Ensure CSS source maps are enabled in dev
  },
  build: {
    cssCodeSplit: false // Try disabling CSS code splitting
  }
})
