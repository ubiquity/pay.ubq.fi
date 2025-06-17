#!/bin/bash

# Exit immediately if a command exits with a non-zero status.
set -e

# Define the frontend directory relative to the script location
FRONTEND_DIR="$(dirname "$0")/../frontend"

# Navigate to the frontend directory
cd "$FRONTEND_DIR"

# Read the project name from package.json
RAW_PROJECT_NAME=$(grep '"name":' package.json | head -n 1 | awk -F'"' '{print $4}')
# Sanitize the project name for Deno Deploy: lowercase, replace dots with hyphens
SANITIZED_PROJECT_NAME=$(echo "$RAW_PROJECT_NAME" | tr '[:upper:]' '[:lower:]' | tr '.' '-')
echo "Deploying frontend for project: $SANITIZED_PROJECT_NAME (from package.json)"

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
# Ensure deployctl is installed: deno install --global -A -r -f https://deno.land/x/deploy@1.12.0/deployctl.ts
# Rely on PATH now that deployctl is installed
deployctl deploy --project="$SANITIZED_PROJECT_NAME" --entrypoint=server.ts --prod

echo "Frontend deployment initiated for $SANITIZED_PROJECT_NAME."
