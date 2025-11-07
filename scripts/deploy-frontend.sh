#!/bin/bash

# Exit immediately if a command exits with a non-zero status.
set -e

echo "=== PAYUBQ FULL-STACK DEPLOY ==="

# Get the project root directory
PROJECT_ROOT="$(dirname "$0")/.."
cd "$PROJECT_ROOT"

# Read the project name from package.json
RAW_PROJECT_NAME=$(grep '"name":' package.json | head -n 1 | awk -F'"' '{print $4}')
# Sanitize the project name for Deno Deploy: lowercase, replace dots with hyphens
SANITIZED_PROJECT_NAME=$(echo "$RAW_PROJECT_NAME" | tr '[:upper:]' '[:lower:]' | tr '.' '-')
echo "Deploying full-stack for project: $SANITIZED_PROJECT_NAME (from package.json)"

# Build the frontend
echo "=== BUILDING FRONTEND ==="
cd frontend
echo "Installing frontend dependencies..."
bun install
echo "Building frontend application with Vite..."
bun run build
cd ..

# Verify the build
echo "=== VERIFYING BUILD ==="
if [ ! -f "frontend/dist/index.html" ]; then
    echo "ERROR: Frontend build failed - index.html not found"
    exit 1
fi
echo "Frontend build successful"

# Deploy to Deno Deploy
echo "=== DEPLOYING TO DENO DEPLOY ==="
echo "Project: $SANITIZED_PROJECT_NAME"
echo "Entrypoint: backend/server.ts"

# Deploy using deployctl
deployctl deploy \
  --project="$SANITIZED_PROJECT_NAME" \
  --entrypoint="backend/server.ts" \
  --include="backend,frontend/dist" \
  --prod

echo "Deployment completed successfully!"
echo "Your app is live at: https://$SANITIZED_PROJECT_NAME.deno.dev"