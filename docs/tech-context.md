# Tech Context: Permit Claiming Application (Rewrite)

This document outlines the technology stack and development environment for the rewritten Permit Claiming application, based on the initial `rewrite-plan.md`.

## 1. Core Technologies

*   **Language:** TypeScript (across frontend, backend, shared code)
*   **Frontend:**
    *   Framework: React
    *   Wallet Integration: `wagmi` (using viem)
    *   Styling: Raw CSS
*   **Backend:**
    *   Platform: Deno Deploy
    *   Routing: Hono
*   **Database:** Supabase (PostgreSQL)
      * Required Environment Variables:
        * `SUPABASE_URL`: Your Supabase project URL
        * `SUPABASE_SERVICE_ROLE_KEY`: Service role key with write permissions
*   **Blockchain Interaction:**
    *   Library: `viem` (latest)
    *   RPC Management: `@pavlovcik/permit2-rpc-manager` (to be integrated).
    *   Contracts: Uniswap Permit2, Custom NFT Reward Contract, Existing deployed Multicall Contracts (e.g., MakerDAO's)

## 2. Development Environment & Tooling

*   **Package Manager:** Bun (as per user instructions)
*   **Repository Structure:**
    *   `frontend/` - Contains all frontend code (React, Vite)
    *   `backend/` - Contains backend server code (Hono)
    *   `docs/` - Project documentation
    *   `scripts/` - Deployment and utility scripts
*   **Unified Package Setup:**
    *   Root-level package.json configuration:
      - npm-run-all in devDependencies for parallel execution
      - Scripts:
        * `start`: Runs both frontend and backend in parallel
        * `frontend:dev`: "cd frontend && bun run dev"
        * `backend:dev`: "cd backend && bun run server.ts"
        * `build`: Runs both frontend and backend builds in parallel
        * `frontend:build`: "cd frontend && bun run build"
        * `backend:build`: "cd backend && bun run build"
        * `install`: Runs both frontend and backend installs in parallel
        * `frontend:install`: "cd frontend && bun install"
        * `backend:install`: "cd backend && bun install"
    *   Development workflow:
      - `bun run install` to install all dependencies
      - `bun run start` to start both frontend and backend in parallel
      - Frontend (Vite) runs on port 5173
      - Backend (Hono) runs on port 3000
      - API routes prefixed with /api
*   **Build Tools:**
    *   Vite for frontend development and production builds
    *   Hono for backend API routes
    *   Unified server setup on port 5173 with:
      - Vite dev server for frontend
      - Hono middleware for API routes (/api prefix)
      - Proxy configuration for development
*   **Testing:**
    *   Unit/Integration: bun test
    *   Component: React Testing Library (if using React)
*   **Linting/Formatting:** ESLint, Prettier (using existing configurations), Deno fmt/lint
*   **Version Control:** Git, GitHub

## 3. Key Libraries & Dependencies

*   `viem`: Blockchain interaction (frontend & backend).
*   `@octokit/rest`: GitHub API interaction (planned for backend scanner).
*   `@supabase/supabase-js` (^2.39.8): Database interaction.
*   `react`, `react-dom`: Frontend framework.
*   `hono` (^4.2.5): Backend routing.
*   `wagmi`: React hooks for wallet connection and interaction.
*   `@cowprotocol/cow-sdk`: For interacting with CowSwap API (quotes, orders).
*   `@pavlovcik/permit2-rpc-manager`: RPC management library (to be integrated).
*   Testing libraries (`@testing-library/react`).

## 4. Infrastructure & Deployment

*   **Backend Hosting:** Deno Deploy.
      * Required Environment Variables:
        * `SUPABASE_URL`: Must be set in Deno Deploy environment
        * `SUPABASE_SERVICE_ROLE_KEY`: Must be set in Deno Deploy environment
      * API Endpoints:
        * `POST /api/permits/record-claim`: Records successful permit claims
          * Requires: nonce, transactionHash, claimerAddress, txUrl
*   **Frontend Hosting:** Deno Deploy (serving static build via unified server setup).
*   **Database Hosting:** Supabase Cloud.
*   **Deployment:**
    *   Frontend: Automated via `scripts/deploy-frontend.sh` (runnable via `bun run deploy` in `frontend/` or directly). Script handles build, project name sanitization (`pay.ubq.fi` -> `pay-ubq-fi`), and `deployctl` execution. Requires `deployctl` v1.12.0+.
    *   Backend: Deno Deploy CLI/GitHub Integration (TBD).
    *   GitHub Actions: TBD for CI/CD.

## 5. Technical Constraints & Considerations

*   Deno Deploy environment specifics and limitations.
*   GitHub API rate limits.
*   RPC provider reliability and rate limits.
*   CowSwap API rate limits and reliability.
*   Security of GitHub tokens and other secrets within Deno Deploy environment variables.
*   Browser compatibility for frontend features (Wallet connection, CowSwap signing, etc.).
*   Unified server configuration must work in both development and production environments.

*(This document will be updated as technology choices are finalized and new dependencies are added.)*
