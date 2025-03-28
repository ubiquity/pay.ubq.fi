#!/bin/bash
# Script to start the backend API development server

echo "Changing directory to backend/api..."
cd backend/api
if [ $? -ne 0 ]; then
  echo "Failed to change directory to backend/api. Exiting."
  exit 1
fi

echo "Starting backend API dev server with deno..."
# Ensure necessary permissions are granted
deno task dev
