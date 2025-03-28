# System Patterns: Permit Claiming Application (Rewrite)

This document outlines the high-level architecture and key design patterns for the rewritten Permit Claiming application, based on the initial `rewrite-plan.md`.

## 1. Architecture Overview

The system follows a decoupled architecture comprising a frontend SPA, backend Deno Deploy functions (API and Scanner), and a Supabase database.

```mermaid
graph LR
    subgraph Browser
        direction LR
        Frontend[Frontend UI (React/TS)] -->|Wallet Ops| Wallet[Web3 Wallet]
        Frontend -->|API Calls| BackendAPI[Backend API]
        Frontend -->|Read Calls| Blockchain[Blockchain RPC]
    end

    subgraph Deno Deploy
        direction TB
        BackendAPI[Backend API Worker] -->|Read/Write| DB[(Database - Supabase)]
        BackendAPI -->|Write Calls| Blockchain
        BackendAPI -->|API Calls (User Token)| GitHub[GitHub API]
        # GitHubScanner Worker is deprecated for user-specific scans
    end

    Wallet -->|Sign/Send Tx| Blockchain
    Blockchain -->|Read Events?| BackendAPI

    style DB fill:#f9f,stroke:#333,stroke-width:2px
    style GitHub fill:#eee,stroke:#333,stroke-width:2px
```

*   **Frontend:** Handles user interaction, wallet management, permit display, initiates claims and scans. Uses raw CSS for styling.
*   **Backend API Worker (Deno):** Serves data to the frontend using Hono for routing, handles GitHub OAuth callback, interacts with the database (fetching permits, linking wallets), performs on-chain validation for permits. GitHub scanning logic (using user token) is planned but not yet implemented.
*   **Backend Scanner Worker (Deno):** Deprecated and likely to be removed.
*   **Database (Supabase):** Stores user data (GitHub ID, wallet address - token encryption TBD), permit details fetched from GitHub (via scanner - TBD), related token/partner/location info, and potentially claim status (TBD).
*   **Blockchain:** Source of truth for permit validity and claim execution.

## 2. Key Patterns & Decisions

*   **Backend for Frontend (BFF):** The Backend API Worker acts as a BFF, handling auth, scanning requests, and data retrieval tailored for the frontend.
*   **User-Triggered Scanning:** Planned feature. GitHub scanning will be initiated by the user via an API call, using their stored GitHub token.
*   **Database as Source/Index:** The database currently stores permit, token, partner, location, and user data, likely populated by an external process or previous version. The API fetches directly from here. It will later act as an index for scanned data.
*   **Client-Side Claiming:** Claim transactions (`permitTransferFrom`) are constructed and signed on the frontend using `wagmi`/`viem`.
*   **Multicall Aggregation:** Planned for future batch claiming feature. Currently, only single claims are implemented.
*   **Blockchain Interaction Library:** `viem` used across frontend (claiming) and backend (validation).
*   **RPC Management:** `@pavlovcik/permit2-rpc-manager` will be used for managing RPC connections and potentially handling fallbacks/retries (to be integrated in backend).
*   **Type Safety:** TypeScript used across frontend, backend, and shared types. API validation is basic.
*   **Testing:** `bun test` for unit/integration tests, React Testing Library for component tests (if using React).

## 3. Data Flow

1.  **Auth:** Frontend -> GitHub -> Frontend -> Backend API -> GitHub -> Backend API -> Frontend (JWT)
2.  **Scanning Trigger:** (Future) Frontend (JWT) -> Backend API (`/api/scan/github`)
3.  **Scanning Execution:** (Future) Backend API (User Token) -> GitHub -> Backend API -> DB
4.  **Presentation:** Frontend (JWT) -> Backend API (`/api/permits`) -> DB -> Backend Validator (On-chain) -> Frontend
5.  **Claiming (Single):** Frontend (`handleClaimPermit`) -> Wallet (Sign Tx) -> Blockchain (`permitTransferFrom`)
6.  **Confirmation:** Frontend (`useWaitForTransactionReceipt`) monitors transaction -> Updates UI state. (Backend update via `/api/permits/update-status` is TBD).

*(This document will be updated as implementation progresses and patterns solidify.)*
