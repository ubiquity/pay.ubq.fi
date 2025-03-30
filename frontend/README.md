# Ubiquity Rewards Frontend

This is the frontend application for the Ubiquity Rewards (Permit Claiming) system. It allows users to connect their Web3 wallet, view available Permit rewards associated with their address, and claim them on the blockchain.

Built with React, TypeScript, Vite, and `wagmi`.

## Setup

1.  Navigate to the `frontend` directory:
    ```bash
    cd frontend
    ```
2.  Install dependencies using Bun:
    ```bash
    bun install
    ```

## Development

To run the development server:

```bash
bun run dev
```

This will start the Vite development server, typically available at `http://localhost:5173`.

## Building for Production

To create a production build:

```bash
bun run build
```

This command runs `tsc -b` for type checking and then `vite build`. The output files will be generated in the `frontend/dist` directory.

## Deployment to Deno Deploy

This project is configured for deployment to Deno Deploy.

**Prerequisites:**

*   Ensure Deno is installed ([https://deno.com/](https://deno.com/)).
*   Install the Deno Deploy CLI (`deployctl`) globally:
    ```bash
    # Note: Version 1.12.0 is specified due to issues with 1.13.1 as of 2025-03-30
    deno install --global -A -r -f https://deno.land/x/deploy@1.12.0/deployctl.ts
    ```
*   Ensure `deployctl` is authenticated with your Deno Deploy account (it may prompt for login on first use).

**Deployment Command:**

From the `frontend` directory, run the deploy script:

```bash
bun run deploy
```

Alternatively, from the project root directory (`pay.ubq.fi`), run:

```bash
bash scripts/deploy-frontend.sh
```

This script handles:
1.  Installing dependencies (`bun install`).
2.  Running the production build (`bun run build`).
3.  Deploying the contents of the `dist` directory using `deployctl`.
    *   It uses `frontend/server.ts` as the entry point to serve static files and handle SPA routing.
    *   It automatically determines the Deno Deploy project name by sanitizing the root project directory name (e.g., `pay.ubq.fi` becomes `pay-ubq-fi`).
