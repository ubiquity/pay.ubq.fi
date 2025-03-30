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
*   **Blockchain Interaction:**
    *   Library: `viem` (latest)
    *   RPC Management: `@pavlovcik/permit2-rpc-manager` (to be integrated).
    *   Contracts: Uniswap Permit2, Custom NFT Reward Contract, Existing deployed Multicall Contracts (e.g., MakerDAO's)

## 2. Development Environment & Tooling

*   **Package Manager:** Bun (as per user instructions)
*   **Repository Structure:** Standard repository structure (e.g., separate directories for frontend, backend, shared code).
*   **Build Tools:** Esbuild (from existing setup), Deno CLI tools
*   **Testing:**
    *   Unit/Integration: bun test
    *   Component: React Testing Library (if using React)
*   **Linting/Formatting:** ESLint, Prettier (using existing configurations), Deno fmt/lint
*   **Version Control:** Git, GitHub

## 3. Key Libraries & Dependencies (Anticipated)

*   `viem`: Blockchain interaction (frontend & backend).
*   `@octokit/rest`: GitHub API interaction (planned for backend scanner).
*   `@supabase/supabase-js`: Database interaction.
*   `react`, `react-dom`: Frontend framework.
*   `hono`: Backend routing.
*   `wagmi`: React hooks for wallet connection and interaction.
*   `@pavlovcik/permit2-rpc-manager`: RPC management library (to be integrated).
*   Testing libraries (`@testing-library/react`).

## 4. Infrastructure & Deployment

*   **Backend Hosting:** Deno Deploy.
*   **Frontend Hosting:** Deno Deploy (serving static build via `frontend/server.ts`).
*   **Database Hosting:** Supabase Cloud.
*   **Deployment:**
    *   Frontend: Automated via `scripts/deploy-frontend.sh` which runs `bun install`, `bun run build`, and `deployctl deploy --project=<dir_name> --entrypoint=frontend/server.ts --prod`.
    *   Backend: Deno Deploy CLI/GitHub Integration (TBD).
    *   GitHub Actions: TBD for CI/CD.

## 5. Technical Constraints & Considerations

*   Deno Deploy environment specifics and limitations.
*   GitHub API rate limits.
*   RPC provider reliability and rate limits.
*   Security of GitHub tokens and other secrets within Deno Deploy environment variables.
*   Browser compatibility for frontend features (Wallet connection, etc.).

*(This document will be updated as technology choices are finalized and new dependencies are added.)*
