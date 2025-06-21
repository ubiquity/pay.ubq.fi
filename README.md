# Multi-Chain PermitAggregator Deployment

This repository contains a script for deploying and verifying the PermitAggregator contract across multiple chains using CREATE2 for deterministic addresses, powered by Etherscan's V2 API for unified verification.

## Supported Networks

- Ethereum (1)
- Optimism (10)
- BNB Smart Chain (56)
- Gnosis Chain (100)
- Polygon (137)
- Base (8453)
- Arbitrum One (42161)
- Celo (42220)
- Avalanche C-Chain (43114)
- Blast (81457)
- Zora (7777777)

## Setup

1. Install dependencies:
```bash
bun install
```

2. Create a `.env` file using `.env.example` as a template:
```bash
cp .env.example .env
```

3. Configure your `.env` file with:
- `DEPLOYER_PRIVATE_KEY`: Your deployer wallet's private key
- `ETHERSCAN_API_KEY`: Your single Etherscan V2 API key (works for all supported chains)

---

## Environment Variable Setup

### Backend Environment

- Place your backend `.env` file in the project root (`./.env`).
- Use `.env.example` as a template:
  ```bash
  cp .env.example .env
  ```
- **Required backend variables** (see `.env.example`):
  - `SUPABASE_URL`: Supabase project URL (for backend API/database access)
  - `SUPABASE_SERVICE_ROLE_KEY`: Supabase service role key (for backend API/database access)
  - `DEPLOYER_PRIVATE_KEY`: Private key for contract deployment scripts
  - `ETHERSCAN_API_KEY`: Etherscan API key for contract verification

### Frontend Environment

- Place your frontend `.env` file in the `frontend/` directory (`frontend/.env`).
- Use `frontend/.env.example` as a template:
  ```bash
  cp frontend/.env.example frontend/.env
  ```
- **Required frontend variables** (see `frontend/.env.example`):
  - `VITE_SUPABASE_URL`: Supabase project URL (for frontend)
  - `VITE_SUPABASE_ANON_KEY`: Supabase anon/public key (for frontend)
  - `VITE_RPC_URL`: Blockchain RPC endpoint for on-chain calls

**Note:**
All frontend environment variables **must** be prefixed with `VITE_` to be accessible in the app (Vite requirement).

### About `.env.example` Files

- `.env.example` and `frontend/.env.example` serve as templates for required environment variables.
- Never commit real secrets to version control—only the example files.
- Always copy the example file and fill in your actual values before running the app.

## Usage

Deploy and verify on all chains:
```bash
bun run deploy-all
```

The script will:
1. Calculate the expected contract address (same across all chains)
2. Deploy to each chain using CREATE2
3. Verify the contract source on each block explorer using the unified Etherscan V2 API

## Required Funds

Make sure your deployer address has enough native tokens on each chain:

- Ethereum (ETH): ~0.01 ETH
- Optimism (ETH): ~0.001 ETH
- BSC (BNB): ~0.005 BNB
- Gnosis (xDAI): ~0.1 xDAI
- Polygon (MATIC): ~1 MATIC
- Base (ETH): ~0.001 ETH
- Arbitrum (ETH): ~0.001 ETH
- Celo (CELO): ~1 CELO
- Avalanche (AVAX): ~0.1 AVAX
- Blast (ETH): ~0.001 ETH
- Zora (ETH): ~0.001 ETH

## Contract Verification

The script automatically verifies the contract on each chain's block explorer using the Etherscan V2 API. You only need to provide a single API key in the `.env` file.

Explorer URLs:

- Ethereum: https://etherscan.io
- Optimism: https://optimistic.etherscan.io
- BSC: https://bscscan.com
- Gnosis: https://gnosisscan.io
- Polygon: https://polygonscan.com
- Base: https://basescan.org
- Arbitrum: https://arbiscan.io
- Celo: https://celoscan.io
- Avalanche: https://snowtrace.io
- Blast: https://blastscan.io
- Zora: https://explorer.zora.energy

## Etherscan V2 API Reference

- [Etherscan V2 Docs](https://docs.etherscan.io/)
- Unified API key for all supported chains
- Use `chainid` parameter to specify the target network for verification
