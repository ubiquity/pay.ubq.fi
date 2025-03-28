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
        GitHubScanner[GitHub Scanner Worker] -->|API Calls| GitHub[GitHub API]
        GitHubScanner -->|Write| DB
    end

    Wallet -->|Sign/Send Tx| Blockchain
    Blockchain -->|Read Events?| BackendAPI

    style DB fill:#f9f,stroke:#333,stroke-width:2px
    style GitHub fill:#eee,stroke:#333,stroke-width:2px
```

*   **Frontend (React):** Handles user interaction, wallet management, permit display, and initiates claims. Uses raw CSS for styling. Hosted on Deno Deploy.
*   **Backend API Worker (Deno):** Serves data to the frontend using Hono for routing, interacts with the database, potentially performs validation.
*   **Backend Scanner Worker (Deno):** Periodically scans GitHub for permits and populates the database. Triggered via Deno Deploy's cron feature.
*   **Database (Supabase):** Stores permit data, claim status, and user information.
*   **Blockchain:** Source of truth for permit validity and claim execution.

## 2. Key Patterns & Decisions

*   **Backend for Frontend (BFF):** The Backend API Worker acts as a BFF, tailoring data specifically for the frontend's needs.
*   **Background Worker:** The GitHub Scanner operates independently as a Deno Deploy function triggered by a cron schedule.
*   **Database as Cache/Index:** The database stores permit data found on GitHub, acting as an index for efficient retrieval and status tracking.
*   **Client-Side Claiming:** Claim transactions are constructed and signed on the frontend, leveraging the user's connected wallet.
*   **Multicall Aggregation:** Batch claiming relies on constructing multicall transactions using existing deployed contracts (e.g., MakerDAO's) to minimize user interactions and gas costs.
*   **Blockchain Interaction Library:** Use of `viem` for blockchain interactions.
*   **RPC Management:** Utilizes the existing custom RPC handler (`use-rpc-handler.ts`).
*   **Type Safety:** TypeScript used across frontend and backend. Zod likely for API validation.
*   **Testing:** `bun test` for unit/integration tests, React Testing Library for component tests.

## 3. Data Flow

1.  **Discovery:** Scanner Worker finds permits on GitHub, parses them, and stores them in Supabase.
2.  **Presentation:** Frontend requests permits for the logged-in user from the Backend API. API fetches from DB, performs validation (including on-chain checks), and returns the list.
3.  **Claiming:** Frontend constructs multicall transaction(s) for valid permits, user signs via Wallet, transaction sent to Blockchain.
4.  **Confirmation:** Frontend monitors transaction, sends hash to Backend API upon success, API updates DB.

*(This document will be updated as implementation progresses and patterns solidify.)*
