import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import svgr from 'vite-plugin-svgr'; // Import the svgr plugin

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    svgr({
      // Removed invalid exportAsDefault option
      // svgr options (passed down to svgr/core)
      svgrOptions: {
        // Ensure ref forwarding is possible if needed
        ref: true,
        // Ensure SVG attributes can be overridden with props
        svgo: false, // Disable svgo optimization if it interferes
      },
      // Ensure it applies to .svg files
      include: "**/*.svg",
    }), // svgr plugin BEFORE react plugin
    react() // React plugin after svgr
  ],
  // server: { hmr: false } // Re-enable HMR globally
  css: {
    devSourcemap: true // Ensure CSS source maps are enabled in dev
  },
  build: {
    cssCodeSplit: false // Try disabling CSS code splitting
  }
})
