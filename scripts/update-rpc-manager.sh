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

echo "Update script finished."
# Removed backend update steps as backend directory is deleted.
