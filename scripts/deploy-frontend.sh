#!/bin/bash

# Exit immediately if a command exits with a non-zero status.
set -e

# Define the frontend directory relative to the script location
FRONTEND_DIR="$(dirname "$0")/../frontend"

# Get the project name from the parent directory of the frontend dir
# (which is the root project directory)
PROJECT_NAME=$(basename "$(dirname "$FRONTEND_DIR")")

echo "Deploying frontend for project: $PROJECT_NAME"

# Navigate to the frontend directory
cd "$FRONTEND_DIR"

# Install dependencies
echo "Installing frontend dependencies..."
bun install

# Build the frontend application (TypeScript first)
echo "Running TypeScript build (tsc -b)..."
bunx tsc -b

# Build with Vite
echo "Building frontend application with Vite..."
bunx vite build

# Deploy using deployctl
echo "Deploying to Deno Deploy..."
# Ensure deployctl is installed: deno install -A -r -f https://deno.land/x/deploy/deployctl.ts
deployctl deploy --project="$PROJECT_NAME" --entrypoint=server.ts --prod

echo "Frontend deployment initiated for $PROJECT_NAME."
