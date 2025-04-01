import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { nodePolyfills } from 'vite-plugin-node-polyfills'; // Import the polyfills plugin

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(), // React plugin
    nodePolyfills({ // Add the node polyfills plugin
      // Options (optional):
      // To exclude specific polyfills, add them to this list.
      // exclude: [],
      // Whether to polyfill `global`.
      globals: { // Use 'globals' instead of 'global'
          global: true, // Polyfill global within globals
          Buffer: true, // Polyfill Buffer within globals
          process: true, // Polyfill process within globals
      },
      // Whether to polyfill `Buffer`. - Handled by globals.Buffer
      // buffer: true,
      // Whether to polyfill `process`. - Handled by globals.process
      // process: true,
    }),
  ],
  // Define global for browser environment
  define: {
    'global': 'globalThis', // Map global to globalThis
  },
  // Server configuration to disable HMR
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
  },
  // Optimize dependencies to handle potential CJS issues
  optimizeDeps: {
    esbuildOptions: {
      // Node.js global to browser globalThis
      define: {
        global: 'globalThis'
      },
      // Enable esbuild polyfill plugins - Keep define here
      // plugins: [
      //   NodeGlobalsPolyfillPlugin({
      //     process: true,
      //     buffer: true,
      //   }),
      //   NodeModulesPolyfillPlugin()
      // ] // Consider these if nodePolyfills plugin isn't enough
    }
  },
  // build: { // Remove duplicate build section
  //   cssCodeSplit: false,
  //   target: 'esnext'
  // },
})
