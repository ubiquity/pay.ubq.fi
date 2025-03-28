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
*   **Backend API Worker (Deno):** Serves data to the frontend using Hono for routing, handles GitHub OAuth callback, performs GitHub scanning using user's token upon request, interacts with the database, potentially performs validation.
*   **Backend Scanner Worker (Deno):** (Deprecated for user-specific scanning).
*   **Database (Supabase):** Stores user data (including encrypted GitHub token) and permit data (associated with users), claim status.
*   **Blockchain:** Source of truth for permit validity and claim execution.

## 2. Key Patterns & Decisions

*   **Backend for Frontend (BFF):** The Backend API Worker acts as a BFF, handling auth, scanning requests, and data retrieval tailored for the frontend.
*   **User-Triggered Scanning:** GitHub scanning is initiated by the authenticated user via an API call, using their specific GitHub token stored securely on the backend. (No global background scanner for user permits).
*   **Database as Cache/Index:** The database stores permit data found on GitHub, acting as an index for efficient retrieval and status tracking per user.
*   **Client-Side Claiming:** Claim transactions are constructed and signed on the frontend, leveraging the user's connected wallet.
*   **Multicall Aggregation:** Batch claiming relies on constructing multicall transactions to minimize user interactions and gas costs.
*   **Blockchain Interaction Library:** Use of `viem` for blockchain interactions.
*   **RPC Management:** Use existing custom RPC handler (`use-rpc-handler.ts`).
*   **Type Safety:** TypeScript used across frontend and backend. Zod likely for API validation.
*   **Testing:** `bun test` for unit/integration tests, React Testing Library for component tests (if using React).

## 3. Data Flow

1.  **Auth:** Frontend -> GitHub -> Frontend -> Backend API -> GitHub -> Backend API -> Frontend (JWT)
2.  **Scanning Trigger:** Frontend (JWT) -> Backend API
3.  **Scanning Execution:** Backend API (User Token) -> GitHub -> Backend API -> DB
4.  **Presentation:** Frontend (JWT) -> Backend API -> DB -> Validator (On-chain) -> Frontend
5.  **Claiming:** Frontend -> Wallet -> Blockchain (Multicall)
6.  **Confirmation:** Frontend monitors transaction, sends hash to Backend API (JWT) upon success, API updates DB.

*(This document will be updated as implementation progresses and patterns solidify.)*
