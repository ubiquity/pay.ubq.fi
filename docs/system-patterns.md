0# System Patterns: Permit Claiming Application (Rewrite)

This document outlines the high-level architecture and key design patterns for the rewritten Permit Claiming application, based on the initial `rewrite-plan.md`.

## 1. Architecture Overview

The system follows a decoupled architecture comprising a frontend SPA, backend Deno Deploy functions (API and Scanner), and a Supabase database.

```mermaid
graph LR
    subgraph Browser
        direction LR
        Frontend[Frontend UI (React/TS)] -->|Wallet Ops| Wallet[Web3 Wallet]
        Frontend -->|Worker Msgs| Worker[Permit Checker Worker]
        Worker -->|Batch RPC Calls| Blockchain[Blockchain RPC]
        # Removed direct Frontend -> RPC link
        # Removed Frontend -> Backend API link (as backend doesn't exist for validation)
    end

    # Removed Deno Deploy subgraph as backend API doesn't exist for validation
    # The only backend interaction is Supabase via the Worker

    Worker -->|Read/Write| DB[(Database - Supabase)]

    Wallet -->|Sign/Send Tx| Blockchain
    Blockchain -->|Read Events?| BackendAPI

    style DB fill:#f9f,stroke:#333,stroke-width:2px
    # Removed GitHub style
```

*   **Frontend:** Handles user interaction, wallet connection/management (via `wagmi`), permit display, and initiates claims. Uses raw CSS for styling.
*   **Permit Checker Worker:** Runs in the browser background. Fetches permit data from Supabase based on connected wallet address. Checks `localStorage` for cached nonce statuses. Performs on-chain validation (nonce, balance, allowance) via **batch JSON-RPC calls** directly to the RPC endpoint *only for permits not cached as claimed*. Updates `localStorage` with newly claimed nonces. Communicates results back to the main frontend thread.
*   **Database (Supabase):** Stores user data (primarily wallet address -> github_id mapping), permit details associated with github_ids, related token/partner/location info. Accessed directly by the Permit Checker Worker.
*   **Blockchain:** Source of truth for permit validity (checked via worker's batch RPC calls) and claim execution (initiated by frontend).
*   **LocalStorage:** Used by the worker to cache the status ("claimed") of permit nonces to reduce redundant checks on subsequent loads.

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
2.  **Permit Fetching & Validation:** Frontend (Wallet Connected) -> Worker (Fetch Supabase) -> Worker (Check LocalStorage Cache) -> Worker (Batch RPC Call for Uncached Permits) -> Worker (Process Results & Update Cache) -> Frontend (Display Permits & Status)
3.  **Claiming (Single):** Frontend (`handleClaimPermit`) -> Wallet (Sign Tx) -> Blockchain (`permitTransferFrom`)
4.  **Confirmation:** Frontend (`useWaitForTransactionReceipt`) monitors transaction -> Updates UI state.

*(This document will be updated as implementation progresses and patterns solidify.)*
