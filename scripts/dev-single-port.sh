#!/bin/bash
# Dev script to serve both frontend and backend on a single port (no HMR)

set -e

echo "Building frontend..."
cd frontend
bun run build
cd ..

echo "Starting backend (serves static frontend and API) on port 8000..."
cd backend && bun run server.ts
