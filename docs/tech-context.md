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

### Unified Dev/Prod Workflow

| Mode         | Frontend Served By | API Served By   | Port | Static Files Location | API Routing         |
|--------------|-------------------|-----------------|------|----------------------|---------------------|
| Development  | Vite Dev Server   | Backend Server  | 5173 | frontend/src         | `/api` proxied to backend |
| Production   | Backend Server    | Backend Server  | 3000 or deploy port    | frontend/dist       | `/api` handled by backend |

#### Running the Project (for New Contributors)

1. `bun install` (at root, installs all dependencies)
2. `bun run dev` (starts Vite and backend; Vite proxies `/api` to backend)
3. Access the app at `http://localhost:5173` (dev) or deployment URL (prod)
4. All API requests use the `/api` prefix

---

### RPC Endpoint Exception

- **All backend API calls** (auth, permit data, etc.) must use `/api/...` and are served from the unified backend/frontend port.
- **Blockchain JSON-RPC calls** are the only exception:
  - The frontend uses a configurable RPC endpoint (`VITE_RPC_URL` in `.env`).
  - Default is `https://rpc.ubq.fi` for production.
  - For local development, set `VITE_RPC_URL=http://localhost:8000` in `.env`.
  - The frontend and worker code always use this variable for blockchain calls.
  - The Vite dev server does **not** proxy or rewrite RPC calls.

**Summary:**
- Use `/api/...` for backend API.
- Use `VITE_RPC_URL` for blockchain RPC.
- Never hardcode RPC URLs or backend ports for blockchain calls.

#### Details

- **Development:** The Vite dev server serves the frontend on port 5173 and proxies all `/api` requests to the backend server (running on port 3000). Static assets are served from `frontend/src`.
- **Production:** The backend server serves both the static frontend (from `frontend/dist`) and all `/api` routes on a single port (typically 3000 or as configured by the deployment platform).
- **Static Files:** In production, all static files are served from `frontend/dist`.
- **API Routing:** All API endpoints are prefixed with `/api`. In development, Vite proxies `/api` requests to the backend.

*   **Build Tools:**
    *   Vite for frontend development and production builds
    *   Hono for backend API routes
*   **Testing:**
    *   Unit/Integration: bun test
    *   Component: React Testing Library (if using React)
*   **Linting/Formatting:** ESLint, Prettier (using existing configurations), Deno fmt/lint
*   **Version Control:** Git, GitHub

## 3. Key Libraries & Dependencies

*   `viem`: Blockchain interaction (frontend & backend).
*   `@octokit/rest`: GitHub API interaction (planned for backend scanner).
*   `@supabase/supabase-js`: Database interaction.
*   `react`, `react-dom`: Frontend framework.
*   `hono`: Backend routing.
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
