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
*   **Permit Checker Worker:** Runs in the browser background. Handles a single `FETCH_AND_VALIDATE` task:
    *   Receives wallet address and optional `lastCheckTimestamp`.
    *   Fetches permits from Supabase (all if no valid timestamp, otherwise only newer ones using the `created` column). Filters by `beneficiary_id` using the user's `github_id` string.
    *   Maps results, classifying as ERC20 based on positive amount.
    *   Performs batch on-chain validation (nonce, balance, allowance) for the fetched & mapped permits using `rpcClient`.
    *   Returns the fully validated list.
*   **Frontend Hook (`usePermitData`):** Orchestrates the process.
    *   Manages `localStorage` for `lastCheckTimestamp` and `permitDataCache` (containing full `PermitData` objects).
    *   On load/refresh, displays cached data immediately, then sends `FETCH_AND_VALIDATE` message to worker with the last timestamp.
    *   Receives the validated list from the worker, merges it into the cache, saves the cache and new timestamp to `localStorage`.
    *   **Quote Fetching:** If a preferred reward token is set (via `localStorage`), fetches quotes from CowSwap API (via `cowswap-utils.ts`) for claimable permits needing swaps. Stores estimated amounts (`estimatedAmountOut`, `quoteError`) in the permit data map (`allPermitsRef`).
    *   Updates the UI state after filtering and potentially adding quote estimates.
*   **Frontend Hook (`usePermitClaiming`):** Handles claim logic.
    *   Currently uses `handleClaimAllValidSequential` for "Claim All", which simulates and claims permits one by one.
    *   **Post-Claim Swapping:** After sequential claims complete, identifies successfully claimed tokens, groups them, and triggers CowSwap order submissions (via `cowswap-utils.ts` and `initiateCowSwap`) for tokens needing to be swapped to the preferred token.
    *   Updates `localStorage` status cache immediately upon successful claim confirmation.
    *   Manages state for swap submission status (`swapSubmissionStatus`).
*   **Frontend Component (`RewardPreferenceSelector`):** Allows user to select preferred reward token from a list (defined in `constants/supported-reward-tokens.ts`). Saves selection to `localStorage`.
*   **Frontend Utility (`cowswap-utils.ts`):** Contains (currently placeholder) functions to interact with CowSwap API for quotes (`getCowSwapQuote`) and order submission (`initiateCowSwap`). Uses `@cowprotocol/cow-sdk`.
*   **Database (Supabase):** Stores user data and permit details (currently only ERC20 expected). Queried by the worker.
*   **Blockchain:** Source of truth for permit validity (checked via worker's batch RPC calls) and claim execution (initiated by frontend).
*   **CowSwap API:** External service used for fetching swap quotes and submitting swap orders.
*   **LocalStorage:** Caches `lastCheckTimestamp`, detailed permit validation status (`PermitDataCache`), and the user's `preferredRewardToken`.

## 2. Key Patterns & Decisions

*   **Backend for Frontend (BFF):** The Backend API Worker acts as a BFF, handling data retrieval tailored for the frontend based on the connected wallet address. No authentication logic handled here directly (wallet connection is client-side).
*   **Database as Source:** The database is the primary source for permit data associated with user wallets. The API fetches directly from here. Assumes data is populated externally.
*   **Client-Side Claiming:** Claim transactions (`permitTransferFrom`) are constructed and signed on the frontend using `wagmi`/`viem`. Currently sequential for "Claim All".
*   **Client-Side Swapping:** Swap orders (via CowSwap) are constructed, signed, and submitted from the frontend using `@cowprotocol/cow-sdk` and `wagmi`/`viem`.
*   **Multicall Aggregation:** Planned for future batch claiming feature. Currently, only single claims are implemented in `usePermitClaiming`. (Note: `active-context.md` mentioned a multicall utility, but the file was not found).
*   **Blockchain Interaction Library:** `viem` used across frontend (claiming) and worker (validation).
*   **RPC Management:** `@pavlovcik/permit2-rpc-manager` will be used for managing RPC connections and potentially handling fallbacks/retries (to be integrated in backend).
*   **Type Safety:** TypeScript used across frontend, backend, and shared types. API validation is basic.
*   **Testing:** `bun test` for unit/integration tests, React Testing Library for component tests (if using React).

## 3. Data Flow

1.  **Wallet Connection:** Frontend (User Action) -> Wallet (Approve Connection) -> Frontend (`useAccount` hook updates).
2.  **Preference Selection:** Frontend (`RewardPreferenceSelector`) -> Save Address (`localStorage`).
3.  **Permit Fetching & Validation:** Frontend (`usePermitData` on connect/refresh) -> Read Timestamp/Cache (`localStorage`) & Display Cache -> Worker (`FETCH_NEW_PERMITS` with timestamp) -> Supabase (Query new) -> Worker (Map & Validate Batch RPC) -> Worker (Return validated list) -> Frontend (`usePermitData` receives list).
4.  **Quote Fetching (Conditional):** Frontend (`usePermitData` after validation or preference change) -> Check Preference (`localStorage`) -> If set, Group Permits -> CowSwap API (`getCowSwapQuote`) -> Frontend (Update Permit Data with `estimatedAmountOut`/`quoteError`) -> Frontend (Update UI).
5.  **Claiming (Sequential "Claim All"):** Frontend (`DashboardPage` User Click) -> `usePermitClaiming` (`handleClaimAllValidSequential`) -> Loop: [ Simulate -> `handleClaimPermit` -> Wallet (Sign Tx) -> Blockchain (`permitTransferFrom`) -> Wait for Receipt -> Update Permit State/Cache (`localStorage`) ].
6.  **Post-Claim Swapping (Conditional):** Frontend (`usePermitClaiming` after loop) -> Read Preference (`localStorage`) -> Group Successful Claims -> Loop: [ CowSwap API (`initiateCowSwap`) -> Wallet (Sign Order) -> CowSwap API (Submit Order) ] -> Frontend (Update Swap Status UI).

*(This document will be updated as implementation progresses and patterns solidify.)*
