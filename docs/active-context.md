# Active Context: Permit Claiming Application (Rewrite)

**Date:** 2025-03-28

## 1. Current Focus

*   Project Initialization & Setup: Re-establishing the project structure and documentation after a directory cleanup. Starting Phase 1 implementation.

## 2. Recent Changes

*   **Project Cleanup:** User cleaned the project directory.
*   **Documentation Recreation:** Recreated core documentation files (`rewrite-plan.md`, `project-brief.md`, `product-context.md`, `system-patterns.md`, `tech-context.md`, `active-context.md`, `progress.md`) based on the finalized plan.

## 3. Next Steps (Immediate)

*   Begin Phase 1 of the implementation plan outlined in `docs/rewrite-plan.md`:
    *   Setup standard repository structure (e.g., create `frontend/`, `backend/`, `shared/` directories).
    *   Initialize Deno projects (API, Scanner) within the `backend/` directory.
    *   Define Supabase database schema (requires Supabase setup/access).
    *   Start implementing the GitHub Scanner Worker in `backend/scanner/`.

## 4. Key Decisions / Open Questions

*   **Decisions Made:**
    *   Styling: Raw CSS
    *   Blockchain Library: `viem`
    *   Repository Structure: Standard repository (not a monorepo/workspace)
    *   Unit/Integration Testing: `bun test`
    *   Backend Platform: Deno Deploy
    *   Backend Routing: Hono
    *   Frontend Framework: React
    *   GitHub Scanning Strategy: Use GitHub API, scan latest to earliest issue in permit's repo.
    *   Multicall Contract: Use existing deployed contracts (e.g., MakerDAO's).
    *   RPC Management: Use existing custom RPC handler (`use-rpc-handler.ts`).
    *   Frontend Hosting: Deno Deploy.
*   **Remaining Questions:**
    *   Specific error handling strategies for different failure modes need definition during implementation.
    *   Choice of viem-compatible wallet connector library (e.g., `wagmi`, Web3Modal).
    *   Supabase project setup/access needed for schema definition.

*(This document will be updated frequently as work progresses.)*
