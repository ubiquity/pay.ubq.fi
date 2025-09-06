import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { nodePolyfills } from "vite-plugin-node-polyfills";
import type { UserConfig } from "vite";

export default defineConfig({
  plugins: [
    react(),
    nodePolyfills({
      globals: {
        global: true,
        Buffer: true,
        process: true,
      },
    }),
  ],
  server: {
    port: 5173,
    hmr: false,
    proxy: {
      // Proxy /api and any top-level numeric path (e.g., /100, /200) to backend
      "/api": {
        target: "http://localhost:8000",
        changeOrigin: true,
      },
      // Regex for top-level numeric routes
      "^/\\d+$": {
        target: "http://localhost:8000",
        changeOrigin: true,
        rewrite: (path) => path,
      },
    },
  },
  css: {
    devSourcemap: true,
  },
  build: {
    cssCodeSplit: false,
    outDir: "dist",
  },
  worker: {
    format: "es",
  },
  optimizeDeps: {
    esbuildOptions: {
      define: {
        global: "globalThis",
      },
    },
  },
}) as UserConfig;
