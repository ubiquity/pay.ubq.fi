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
        GitHubScanner[GitHub Scanner Worker] -->|API Calls| GitHub[GitHub API]
        GitHubScanner -->|Write| DB
    end

    Wallet -->|Sign/Send Tx| Blockchain
    Blockchain -->|Read Events?| BackendAPI

    style DB fill:#f9f,stroke:#333,stroke-width:2px
    style GitHub fill:#eee,stroke:#333,stroke-width:2px
```

*   **Frontend:** Single Page Application (SPA) built with TypeScript. Likely React, leveraging existing component testing infrastructure (React Testing Library) and component libraries. Responsible for UI, wallet interaction, initiating scans, displaying permits, and constructing/sending batch claim transactions. Styling will use raw CSS.
*   **Backend:** Deno (TypeScript), deployed on Deno Deploy.
    *   **API Worker:** Handles requests from the frontend (e.g., fetching permits for a user, potentially triggering scans). Interacts with the database. May perform some validation checks.
    *   **GitHub Scanner Worker:** Runs periodically or on trigger. Uses the GitHub API to scan configured repositories/issues for comments containing permit URLs (`?claim=...`). Parses the Base64 data, extracts permit details, and stores them in the database. Needs GitHub credentials/token.
*   **Database:** Supabase (PostgreSQL) is recommended given prior use. Stores:
    *   Found permit details (type, contract addresses, amounts, nonces, deadlines, signatures, metadata, GitHub source URL).
    *   Claim status (transaction hash, claimed timestamp).
    *   User associations (linking GitHub user ID to permits).
*   **Blockchain Interaction:** Primarily driven by the Frontend for claiming (requires user signature). Uses `viem` (latest). Validation checks might occur on both frontend and backend. RPC management needs investigation (custom or viem capabilities).

## 3. Key Features & Implementation Details

### 3.1. GitHub Permit Scanner (Backend Worker)

*   **Trigger:** Cron job (via Deno Deploy's cron feature) or manual trigger via API.
*   **Authentication:** Use a GitHub App or Personal Access Token with appropriate permissions to read repository comments. Store securely (Deno Deploy environment variables).
*   **Scanning:**
    *   Fetch list of target repositories/organizations from configuration.
    *   Use GitHub Search API or iterate through issues/comments in target repos.
    *   Identify comments containing the specific `FRONTEND_URL?claim=` pattern.
    *   Extract the Base64 encoded data.
*   **Parsing:**
    *   Use `decodePermits` (or reimplement if necessary) to decode Base64 and parse the JSON (array or single object).
    *   Identify permit type (`erc20-permit` or `erc721-permit`).
    *   Extract all relevant fields (token address, amount, nonce, deadline, beneficiary, owner, signature, networkId, ERC721 request data).
*   **Storage:**
    *   Store structured permit data in the database, linking to the GitHub comment URL and potentially the GitHub user ID if identifiable.
    *   Handle duplicates (e.g., based on nonce, contract, owner).
*   **Error Handling:** Robustly handle GitHub API rate limits, network errors, parsing errors.

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

1.  **Scanning:** GitHub -> Scanner Worker -> DB
2.  **Fetching:** Frontend -> API Worker -> DB -> Validator (On-chain) -> Frontend
3.  **Claiming:** Frontend -> Wallet -> Blockchain (Multicall)
4.  **Updating:** Frontend (Tx Monitor) -> API Worker -> DB

## 6. Implementation Phases (Suggested)

1.  **Phase 1: Backend Foundation & Scanning**
    *   Setup standard repository structure (e.g., separate directories for frontend, backend-api, backend-scanner, shared).
    *   Setup Deno projects (API, Scanner) with basic routing.
    *   Setup Supabase database schema.
    *   Implement GitHub Scanner Worker logic (auth, scanning, parsing, DB storage).
    *   Implement basic Backend API endpoint to fetch raw permits from DB.
2.  **Phase 2: Frontend Foundation & Permit Display**
    *   Setup React frontend project (using Raw CSS).
    *   Implement GitHub OAuth login.
    *   Implement basic UI layout.
    *   Fetch and display raw permits from the backend API for the logged-in user.
    *   Integrate Wallet Connection library.
3.  **Phase 3: Validation Logic**
    *   Implement on-chain validation checks (ERC20 & ERC721) in Backend API or shared library.
    *   Integrate validation status into the API response and frontend display.
4.  **Phase 4: Batch Claiming**
    *   Implement multicall transaction construction logic on the frontend for both permit types.
    *   Add "Claim" buttons and associated UI flows.
    *   Implement transaction monitoring.
5.  **Phase 5: Claim Status Update & Polish**
    *   Implement Backend API endpoint to receive transaction hashes and update DB.
    *   Integrate status updates into the frontend.
    *   Refine UI/UX, add loading states, error handling.
    *   Add comprehensive tests (`bun test`, RTL).
6.  **Phase 6: Documentation & Deployment**
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
