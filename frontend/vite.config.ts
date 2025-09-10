import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { nodePolyfills } from 'vite-plugin-node-polyfills';
import type { UserConfig } from 'vite';

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
    // Performance optimizations
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true,
        drop_debugger: true
      }
    },
    rollupOptions: {
      output: {
        manualChunks: {
          // Vendor chunk for large libraries
          vendor: ['react', 'react-dom'],
          crypto: ['viem', '@uniswap/permit2-sdk'],
          ui: ['@tanstack/react-query', 'react-router-dom']
        }
      }
    },
    // Enable source maps in production for debugging
    sourcemap: true,
    // Optimize chunk size
    chunkSizeWarningLimit: 1000
  },
  worker: {
    format: 'es'
  },
  optimizeDeps: {
    esbuildOptions: {
      define: {
        global: 'globalThis'
      }
    },
    // Pre-bundle these dependencies for faster startup
    include: [
      'react',
      'react-dom', 
      'viem',
      '@tanstack/react-query',
      'react-router-dom'
    ]
  }
}) as UserConfig;
