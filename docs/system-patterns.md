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
        # Removed GitHub API interaction
    end

    Wallet -->|Sign/Send Tx| Blockchain
    Blockchain -->|Read Events?| BackendAPI

    style DB fill:#f9f,stroke:#333,stroke-width:2px
    # Removed GitHub style
```

*   **Frontend:** Handles user interaction, wallet connection/management (via `wagmi`), permit display, and initiates claims. Uses raw CSS for styling.
*   **Backend API Worker (Deno):** Serves data to the frontend using Hono for routing. Interacts with the database (fetching permits based on wallet address), performs on-chain validation for permits. No direct GitHub interaction.
*   **Backend Scanner Worker (Deno):** Deprecated and likely to be removed. Assumes permit data linked to wallets is populated externally or via a separate process.
*   **Database (Supabase):** Stores user data (primarily wallet address), permit details associated with wallets, related token/partner/location info, and potentially claim status (TBD).
*   **Blockchain:** Source of truth for permit validity and claim execution.

## 2. Key Patterns & Decisions

*   **Backend for Frontend (BFF):** The Backend API Worker acts as a BFF, handling data retrieval tailored for the frontend based on the connected wallet address. No authentication logic handled here directly (wallet connection is client-side).
*   **Database as Source:** The database is the primary source for permit data associated with user wallets. The API fetches directly from here. Assumes data is populated externally.
*   **Client-Side Claiming:** Claim transactions (`permitTransferFrom`) are constructed and signed on the frontend using `wagmi`/`viem`.
*   **Multicall Aggregation:** Planned for future batch claiming feature. Currently, only single claims are implemented.
*   **Blockchain Interaction Library:** `viem` used across frontend (claiming) and backend (validation).
*   **RPC Management:** `@pavlovcik/permit2-rpc-manager` will be used for managing RPC connections and potentially handling fallbacks/retries (to be integrated in backend).
*   **Type Safety:** TypeScript used across frontend, backend, and shared types. API validation is basic.
*   **Testing:** `bun test` for unit/integration tests, React Testing Library for component tests (if using React).

## 3. Data Flow

1.  **Wallet Connection:** Frontend (User Action) -> Wallet (Approve Connection) -> Frontend (`useAccount` hook updates)
2.  **Presentation:** Frontend (Wallet Connected) -> Backend API (`/api/permits?walletAddress=...`) -> DB -> Backend Validator (On-chain) -> Frontend
3.  **Claiming (Single):** Frontend (`handleClaimPermit`) -> Wallet (Sign Tx) -> Blockchain (`permitTransferFrom`)
4.  **Confirmation:** Frontend (`useWaitForTransactionReceipt`) monitors transaction -> Updates UI state. (Backend update via `/api/permits/update-status` is TBD).

*(This document will be updated as implementation progresses and patterns solidify.)*
