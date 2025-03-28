# Active Context: Permit Claiming Application (Rewrite)

**Date:** 2025-03-28

## 1. Current Focus

*   Project Initialization: The project is being initiated as a complete rewrite of the previous `pay.ubq.fi` application.
*   Planning & Documentation: The initial focus is on analyzing the old codebase, defining the new requirements, architecting the solution, and creating the foundational documentation (`project-brief.md`, `product-context.md`, `rewrite-plan.md`, `system-patterns.md`, `tech-context.md`, `active-context.md`, `progress.md`).

## 2. Recent Changes

*   **Codebase Analysis:** Completed analysis of the existing `pay.ubq.fi` codebase to understand permit handling (ERC20/Permit2, ERC721/Custom), validation, claiming logic, and dependencies. Identified reusable components (RPC handler, ABIs) and areas needing new implementation (GitHub scanning, batch claiming).
*   **Documentation Created:**
    *   `docs/project-brief.md`: Defines goals and core requirements.
    *   `docs/product-context.md`: Outlines the problem, solution, and user goals.
    *   `docs/rewrite-plan.md`: Details the proposed architecture, features, tech stack, and implementation phases.
    *   `docs/system-patterns.md`: Describes the high-level architecture and design patterns.
    *   `docs/tech-context.md`: Lists the technology stack and development environment.
    *   `docs/active-context.md`: This file.
    *   `docs/progress.md`: Initial state defined.

## 3. Next Steps (Immediate)

*   Begin Phase 1 of the implementation plan outlined in `docs/rewrite-plan.md`:
    *   Setup standard repository structure (e.g., separate directories for frontend, backend, shared).
    *   Initialize Deno projects (API, Scanner).
    *   Define Supabase database schema.
    *   Start implementing the GitHub Scanner Worker.

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

*(This document will be updated frequently as work progresses.)*
