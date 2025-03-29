#!/bin/bash
# Script to update @pavlovcik/permit2-rpc-manager to the latest version
# in both frontend and backend.

set -e # Exit immediately if a command exits with a non-zero status.

echo "Updating frontend..."
cd frontend
if [ $? -ne 0 ]; then
  echo "Failed to change directory to frontend. Exiting."
  exit 1
fi
bun update @pavlovcik/permit2-rpc-manager --latest
cd .. # Go back to the root directory

echo "Updating backend..."
cd backend/api
if [ $? -ne 0 ]; then
  echo "Failed to change directory to backend/api. Exiting."
  exit 1
fi

# Remove lock file to ensure latest is fetched based on deno.jsonc
if [ -f deno.lock ]; then
  echo "Removing backend/api/deno.lock..."
  rm deno.lock
else
  echo "backend/api/deno.lock not found, skipping removal."
fi

# Reload cache to fetch the latest dependency
echo "Reloading Deno cache for main.ts..."
deno cache --reload main.ts

echo "Update script finished."
cd ../.. # Go back to the root directory
