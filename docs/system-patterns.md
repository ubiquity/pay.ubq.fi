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
*   **Permit Checker Worker:** Runs in the browser background. Handles two main tasks:
    1.  `FETCH_ALL_PERMITS`: Fetches all potentially claimable permits (ERC20 only, based on positive amount) from Supabase, optionally filtered by a timestamp provided by the main thread. Returns the raw, mapped list.
    2.  `VALIDATE_PERMITS`: Receives a subset of permits (typically new/uncached ones) from the main thread and performs batch on-chain validation (nonce, balance, allowance) using `rpcClient`. Returns the validation results for the subset.
*   **Frontend Hook (`usePermitData`):** Orchestrates the process.
    *   Manages `localStorage` for `lastCheckTimestamp` and `permitStatusCache` (containing `isNonceUsed`, `checkError`, etc.).
    *   On load, fetches all permits via worker, merges with cache, identifies new/uncached permits, sends them for validation via worker, and updates UI.
    *   Updates cache and timestamp upon receiving validation results.
*   **Frontend Hook (`usePermitClaiming`):** Handles claim logic. Upon successful claim confirmation, updates the `localStorage` status cache immediately.
*   **Database (Supabase):** Stores user data and permit details (currently only ERC20 expected). Queried by the worker.
*   **Blockchain:** Source of truth for permit validity (checked via worker's batch RPC calls) and claim execution (initiated by frontend).
*   **LocalStorage:** Caches `lastCheckTimestamp` and detailed validation status (`isNonceUsed`, errors, etc.) for permits between sessions.

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
2.  **Permit Fetching (Subsequent Load):** Frontend (Wallet Connected) -> Read Timestamp/Cache (LocalStorage) -> Worker (`FETCH_ALL_PERMITS` with timestamp) -> Supabase (Query new) -> Worker (Return new permits) -> Frontend (Merge new with cached, identify subset for validation) -> Worker (`VALIDATE_PERMITS` with subset) -> Blockchain (Batch RPC) -> Worker (Return validation results) -> Frontend (Update state, Update cache/timestamp, Filter for display)
3.  **Claiming (Single):** Frontend (`handleClaimPermit`) -> Wallet (Sign Tx) -> Blockchain (`permitTransferFrom`)
4.  **Confirmation:** Frontend (`useWaitForTransactionReceipt`) monitors transaction -> Updates UI state -> Update Cache (LocalStorage).

*(This document will be updated as implementation progresses and patterns solidify.)*
