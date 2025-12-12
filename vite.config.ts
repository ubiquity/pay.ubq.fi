import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import type { UserConfig } from "vite";
import { dirname, resolve as resolvePath } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const reactJsxRuntimeProd = resolvePath(__dirname, "node_modules/react/cjs/react-jsx-runtime.production.js");
const reactJsxDevRuntimeProd = resolvePath(__dirname, "node_modules/react/cjs/react-jsx-dev-runtime.production.js");

export default defineConfig(({ command }) => ({
  // Load env vars from the repo root so the frontend picks up the same .env file as the server.
  envDir: __dirname,
  plugins: [
    react(),
  ],
  resolve: {
    // React 19 ships CJS entrypoints behind a NODE_ENV switch. Rollup can't
    // statically infer named exports from that wrapper, so alias directly to
    // the production CJS files for build. Use exact match for "react" so we
    // don't rewrite subpath imports.
    alias: command === "build"
      ? [
          { find: "react/jsx-runtime", replacement: reactJsxRuntimeProd },
          { find: "react/jsx-dev-runtime", replacement: reactJsxDevRuntimeProd },
        ]
      : [],
  },
  server: {
    port: 5173,
    hmr: false,
    proxy: {
      // Proxy /api and any top-level numeric path (e.g., /100, /200) to backend
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
      // Regex for top-level numeric routes
      '^/\\d+$': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        rewrite: (path) => path,
      }
    }
  },
  css: {
    devSourcemap: true
  },
  build: {
    cssCodeSplit: false,
    outDir: 'dist',
    commonjsOptions: {
      transformMixedEsModules: true,
      requireReturnsDefault: "auto",
      include: [/node_modules/],
    },
  },
  worker: {
    format: 'es'
  },
  optimizeDeps: {
    esbuildOptions: {
      define: {
        global: 'globalThis'
      }
    }
  }
})) as UserConfig;
