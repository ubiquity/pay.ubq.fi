#!/bin/bash
# Script to start the frontend development server

echo "Changing directory to frontend..."
cd frontend
if [ $? -ne 0 ]; then
  echo "Failed to change directory to frontend. Exiting."
  exit 1
fi

echo "Starting frontend dev server with bun..."
bun run dev
