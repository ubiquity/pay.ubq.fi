#!/bin/bash
# Redeploy and verify PermitAggregator contract on Gnosis Chain
#
# This script handles the setup and execution of the redeployment process

# Ensure we're in the project root directory
cd "$(dirname "$0")/.." || exit 1
echo "Working directory: $(pwd)"

# Check if .env file exists
if [ ! -f ".env" ]; then
  echo "Error: .env file not found. Creating one from .env.example..."
  cp .env.example .env
  echo ""
  echo "Please edit the .env file and add your DEPLOYER_PRIVATE_KEY, then run this script again."
  echo "You need to fund your deployer address with some xDAI for transaction fees."
  exit 1
fi

# Check if DEPLOYER_PRIVATE_KEY is set in .env
if ! grep -q "DEPLOYER_PRIVATE_KEY=" .env || grep -q "DEPLOYER_PRIVATE_KEY=$" .env; then
  echo "Error: DEPLOYER_PRIVATE_KEY is not set in .env file."
  echo "Please edit the .env file and add your DEPLOYER_PRIVATE_KEY, then run this script again."
  exit 1
fi

# Install dependencies if not already installed
echo "Checking dependencies..."
if ! bun list | grep -q "viem"; then
  echo "Installing dependencies..."
  bun add viem axios solc
fi

# Run the deployment script
echo ""
echo "=== Starting Deployment and Verification ==="
echo ""
bun run scripts/redeploy-verify-gnosis.ts

# Check the result
if [ $? -eq 0 ]; then
  echo ""
  echo "Deployment process completed. Check the output above for details."
  echo "The deployment information is saved in scripts/deployment-result.json"
else
  echo ""
  echo "Deployment process failed. Please check the error messages above."
fi
