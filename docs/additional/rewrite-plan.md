# Rewrite Plan: Permit Claiming Application

Based on the analysis of the existing `pay.ubq.fi` codebase and the requirements outlined in `project-brief.md` and `product-context.md`, this document details the plan for rewriting the application from scratch.

## 1. Goals

*   Develop a new application focused solely on finding, validating, and batch-claiming GitHub Permit rewards (ERC20/Permit2 and ERC721/Custom).
*   Implement direct GitHub scanning for permit discovery.
*   Provide a robust validation mechanism for both permit types.
*   Enable efficient batch claiming via multicall transactions.
*   Establish a clean, maintainable, and well-documented codebase.
*   Utilize modern tooling and best practices.

## 2. Proposed Architecture

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

*   **Frontend:** Single Page Application (SPA) built with TypeScript. Likely React, leveraging existing component testing infrastructure (React Testing Library) and component libraries. Responsible for UI, wallet interaction, initiating scans, displaying permits, and constructing/sending batch claim transactions. Styling will use raw CSS.
*   **Backend:** Deno (TypeScript), deployed on Deno Deploy.
    *   **API Worker:** Handles requests from the frontend (e.g., fetching permits, triggering scans, GitHub auth callback). Interacts with the database. Performs GitHub scanning using the authenticated user's token. May perform validation checks.
    *   **GitHub Scanner Worker:** (Deprecated for user-specific scanning). May be removed or repurposed for global tasks if needed later.
*   **Database:** Supabase (PostgreSQL) is recommended given prior use. Stores:
    *   User information (GitHub ID, encrypted GitHub access token, etc.).
    *   Found permit details (type, contract addresses, amounts, nonces, deadlines, signatures, metadata, GitHub source URL, associated user ID).
    *   Claim status (transaction hash, claimed timestamp).
    *   User associations (linking GitHub user ID to permits).
*   **Blockchain Interaction:** Primarily driven by the Frontend for claiming (requires user signature). Uses `viem` (latest). Validation checks might occur on both frontend and backend. RPC management needs investigation (custom or viem capabilities).

## 3. Key Features & Implementation Details

### 3.1. GitHub Permit Scanning (via Backend API)

*   **Trigger:** Authenticated user initiates via frontend call to `POST /api/scan/github`.
*   **Authentication:** Uses the user's GitHub access token (retrieved from secure storage, associated with the user's session) via the verified JWT.
*   **Scanning (within API endpoint):**
    *   Initialize Octokit with the user's token.
    *   Fetch list of target repositories/organizations relevant to the user or application configuration.
    *   Use GitHub Search API or iterate through issues/comments in target repos.
    *   Identify comments containing the specific `FRONTEND_URL?claim=` pattern.
    *   Extract the Base64 encoded data.
*   **Parsing:**
    *   Use `decodePermits` (or reimplement if necessary) to decode Base64 and parse the JSON (array or single object).
    *   Identify permit type (`erc20-permit` or `erc721-permit`).
    *   Extract all relevant fields (token address, amount, nonce, deadline, beneficiary, owner, signature, networkId, ERC721 request data).
*   **Storage:**
    *   Store structured permit data in the database, linking to the GitHub comment URL and **associating it with the authenticated user's ID**.
    *   Handle duplicates (e.g., based on nonce, network_id, user_id).
*   **Error Handling:** Robustly handle GitHub API rate limits (specific to the user's token), network errors, parsing errors. Return appropriate feedback to the frontend.
*   **Background Execution:** The API endpoint should return quickly. The actual scan might run asynchronously (consider Deno KV Queues for longer tasks).

### 3.2. Permit Validation (Backend API / Frontend)

*   **Trigger:** When frontend requests permits for a user.
*   **Process:**
    1.  Fetch potential permits for the user from the database.
    2.  Check database for existing claim transaction hash. If present, mark as claimed.
    3.  **On-Chain Checks (using RPC handler):**
        *   **ERC20 (Permit2):**
            *   Call `nonceBitmap` on Permit2 contract (`0x00...78BA3`) to check if nonce is used.
            *   Check `deadline`.
            *   (Optional but recommended) Check funder (`owner`) `balanceOf` and `allowance` for Permit2 contract.
        *   **ERC721 (Custom NFT):**
            *   Call `nonceRedeemed` on the specific NFT contract (`tokenAddress`).
            *   Check `deadline`.
    4.  Mark permits as valid/invalid/claimed based on checks.
    5.  Return validated permit list to frontend.
*   **Caching:** Implement caching for on-chain checks where appropriate (e.g., nonce status).

### 3.3. Batch Claiming (Frontend)

*   **Trigger:** User clicks "Claim All" (or similar).
*   **Wallet Connection:** Ensure user's wallet is connected and matches the beneficiary address for the permits being claimed.
*   **Permit Grouping:** Filter for valid, unclaimed permits where the connected user is the beneficiary. Group permits by:
    *   Network ID.
    *   Permit Type (ERC20 vs ERC721).
    *   (For ERC721) Specific NFT Contract Address.
*   **Transaction Construction (Multicall):**
    *   For each group on a specific network:
        *   **ERC20 Group:** Construct a multicall transaction targeting the Permit2 contract, aggregating multiple `permitTransferFrom` calls.
        *   **ERC721 Group:** Construct a multicall transaction targeting the specific NFT contract, aggregating multiple `safeMint` calls. (Requires a standard Multicall contract deployed or using one provided by the network).
*   **Execution:**
    *   User signs and sends the transaction(s) via their wallet.
    *   Monitor transaction status.
*   **Status Update:** On successful confirmation, send the transaction hash and claimed nonces to the backend API to update the database. Update UI.

### 3.4. User Interface (Frontend)

*   **Authentication:** GitHub OAuth flow to identify the user and authorize GitHub API calls (if scanning is initiated/scoped from frontend) or associate permits fetched by the backend scanner.
*   **Permit Display:**
    *   List permits fetched from the backend API.
    *   Clearly show status (Valid, Claimed, Expired, Invalid Nonce, Insufficient Funds/Allowance, Not Your Permit).
    *   Display key details (Token/NFT, Amount, Source GitHub Link).
    *   Filtering/Sorting options.
*   **Wallet Integration:** Use viem-compatible libraries like `wagmi` or Web3Modal for easy wallet connection and network switching. Display connected address and network.
*   **Claim Controls:** "Claim Selected" / "Claim All Valid" button(s). Clear feedback during the claiming process (signing, sending, confirming). Links to block explorer for submitted transactions.

## 4. Technology Stack

*   **Frontend:** TypeScript, React (TBD, but likely), viem, Raw CSS, Wallet Connector Library (e.g., `wagmi`).
*   **Backend:** Deno (TypeScript), Hono (for routing), viem, `@octokit/rest`.
*   **Database:** Supabase (PostgreSQL).
*   **Blockchain:** viem, ABIs (Permit2, Custom NFT, ERC20, Multicall).
*   **Testing:** `bun test` (Unit/Integration), React Testing Library (Component, if using React).
*   **Build/Deploy:** Bun, Deno CLI tools, Esbuild (from existing setup).

## 5. Data Flow Summary

1.  **Auth:** Frontend -> GitHub -> Frontend -> Backend API -> GitHub -> Backend API -> Frontend (JWT)
2.  **Scanning Trigger:** Frontend (JWT) -> Backend API
3.  **Scanning Execution:** Backend API (User Token) -> GitHub -> Backend API -> DB
4.  **Fetching:** Frontend (JWT) -> Backend API -> DB -> Validator (On-chain) -> Frontend
5.  **Claiming:** Frontend -> Wallet -> Blockchain (Multicall)
4.  **Updating:** Frontend (Tx Monitor) -> API Worker -> DB

## 6. Implementation Phases (Suggested)

1.  **Phase 1: Backend Foundation & Auth**
    *   Setup standard repository structure (e.g., separate directories for frontend, backend, shared).
    *   Setup Deno API project (`backend/api/`) with Hono routing.
    *   Implement GitHub OAuth callback endpoint (`/api/auth/github/callback`) including code exchange, user lookup/creation, GitHub token storage (encrypted), and JWT generation.
    *   Setup Supabase database schema (including `users` table with encrypted token storage and `permits` table).
    *   Implement JWT verification middleware.
2.  **Phase 2: Frontend Foundation & Auth Integration**
    *   Setup React frontend project (using Raw CSS).
    *   Implement GitHub OAuth login flow (redirect, callback handling, storing JWT).
    *   Integrate Auth Context for global state.
    *   Implement basic UI layout (Login page, Dashboard page).
    *   Integrate Wallet Connection library (`wagmi`).
3.  **Phase 3: GitHub Scanning & Permit Display**
    *   Implement `POST /api/scan/github` endpoint in backend API, including retrieving user token and basic scanning logic (moved from scanner service).
    *   Add "Scan" button to frontend dashboard to trigger the API endpoint.
    *   Implement `GET /api/permits` endpoint in backend API to fetch permits for the authenticated user from DB.
    *   Implement `fetchPermits` in frontend to call the API and display permits in the table.
4.  **Phase 4: Validation Logic**
    *   Implement on-chain validation checks (ERC20 & ERC721) - likely triggered by the backend API when fetching permits or on-demand from frontend.
    *   Integrate validation status into the API response and frontend display.
5.  **Phase 5: Batch Claiming**
    *   Implement multicall transaction construction logic on the frontend using `viem`.
    *   Add "Claim" buttons and associated UI flows.
    *   Implement transaction monitoring.
6.  **Phase 6: Claim Status Update & Polish**
    *   Implement `POST /api/permits/update-status` endpoint in backend API.
    *   Call status update endpoint from frontend after successful claim.
    *   Refine UI/UX, add loading states, detailed error handling.
    *   Add comprehensive tests (`bun test`, RTL).
7.  **Phase 7: Documentation & Deployment**
    *   Update/Create all `docs/` files (`system-patterns.md`, `tech-context.md`, `active-context.md`, `progress.md`).
    *   Create `.clinerules` if patterns emerge.
    *   Configure deployment pipelines for Deno Deploy and frontend hosting. Deploy.

## 7. Decisions & Considerations

*   **GitHub Scanning Strategy:** Use the GitHub API. Scan from the latest issue number to the earliest within the repository associated with the permit. Initially target specific repositories, potentially adding user configuration later.
*   **Multicall Contract:** Use existing, widely deployed multicall contracts (e.g., MakerDAO's).
*   **Error Handling:** Specific error states and user feedback need to be defined for various failure modes (GitHub API errors, RPC errors, validation failures, multicall failures, user rejection). This will be addressed during implementation.
*   **Security:** Securely store GitHub tokens/secrets in Deno Deploy environment variables. Implement robust input validation. Nonces are sufficient for replay attack protection.
*   **Frontend Framework:** Use React.
*   **RPC Management:** Continue using the existing custom RPC handler, acknowledging it needs a rewrite eventually.
*   **Frontend Hosting:** Use Deno Deploy.

This plan provides a detailed roadmap for the rewrite. I will now update the other documentation files to reflect these changes.
