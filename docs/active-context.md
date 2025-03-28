# Active Context: Permit Claiming Application (Rewrite)

**Date:** 2025-03-28

## 1. Current Focus

*   Project Initialization & Setup: Re-establishing the project structure and documentation after a directory cleanup. Starting Phase 1 implementation.

## 2. Recent Changes

*   **Project Cleanup:** User cleaned the project directory.
*   **Documentation Recreation:** Recreated core documentation files (`rewrite-plan.md`, `project-brief.md`, `product-context.md`, `system-patterns.md`, `tech-context.md`, `active-context.md`, `progress.md`) based on the finalized plan.

## 3. Next Steps (Immediate)

*   Begin Phase 1 of the implementation plan outlined in `docs/rewrite-plan.md`:
    *   Setup standard repository structure.
    *   Initialize Deno API project (`backend/api/`).
    *   Implement GitHub OAuth callback endpoint in API, including JWT generation and placeholder for storing user's GitHub token.
    *   Implement JWT verification middleware in API.
    *   Define Supabase database schema (requires Supabase setup/access) - including `users` table with encrypted token storage.
*   Begin Phase 2:
    *   Integrate Auth Context and login flow into frontend.
*   Begin Phase 3:
    *   Add placeholder API endpoint (`/api/scan/github`) and frontend trigger button.
    *   Deprecate standalone scanner service (`backend/scanner/`).

## 4. Key Decisions / Open Questions

*   **Decisions Made:**
    *   Styling: Raw CSS
    *   Blockchain Library: `viem`
    *   Repository Structure: Standard repository
    *   Unit/Integration Testing: `bun test`
    *   Backend Platform: Deno Deploy
    *   Backend Routing: Hono
    *   Frontend Framework: React
    *   GitHub Scanning Strategy: User-triggered via API using stored user OAuth token. Standalone scanner deprecated.
    *   Multicall Contract: Use existing deployed contracts.
    *   RPC Management: Use existing custom RPC handler.
    *   Frontend Hosting: Deno Deploy.
    *   Authentication: Custom backend flow with JWT sessions.
*   **Remaining Questions:**
    *   Supabase project setup/access and schema definition (including `users` table with encrypted token storage).
    *   Implementation details for encrypting/decrypting GitHub token in backend.
    *   Specific error handling strategies.
    *   Choice of viem-compatible wallet connector library.

*(This document will be updated frequently as work progresses.)*
