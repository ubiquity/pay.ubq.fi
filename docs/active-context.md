# Active Context: Permit Claiming Application (Rewrite)

**Date:** 2025-04-01 (Updated)

## 1. Current Focus

*   Implementing and testing the CowSwap integration for automatic reward swapping based on user preference.
*   Refining the UI to display estimated post-swap values and swap submission status.
*   Obtaining necessary information (UUSD address, CowSwap SDK usage details) to complete the feature.
*   (Previous focus items like pre-claim checks are assumed stable or superseded by current work).

## 2. Recent Changes

*   **Unified Server Setup (2025-05-18):**
    *   The backend now serves both the static frontend (from `frontend/dist`) and all API routes on a single port in production.
    *   In development, the Vite dev server serves the frontend and proxies all `/api` requests to the backend.
    *   All API endpoints are prefixed with `/api`.
    *   This simplifies deployment and local development for new contributors.
*   **Backend API**:
    *   Added transaction recording endpoint `/api/permits/record-claim` that updates the `transaction` column in the `permits` table with the transaction hash and URL
*   **Frontend**:
    *   **CSS Migration:** Removed all inline styles from `App.tsx` and `DashboardPage.tsx`. Created `frontend/src/app-styles.css` and migrated styles to CSS classes. Imported `app-styles.css` in `main.tsx`.
    *   **Refactored DashboardPage:** Extracted helper functions (`checkPermitPrerequisites`, `formatAmount`, `hasRequiredFields`) into `frontend/src/utils/permit-utils.ts`. Extracted table rendering logic into new components: `frontend/src/components/permits-table.tsx` and `frontend/src/components/permit-row.tsx`. This significantly reduced the line count of `DashboardPage.tsx`.
    *   **Implemented Pre-Claim Checks:** Added checks for owner balance and Permit2 allowance (now in `permit-utils.ts`) before initiating a claim. These checks run after permits are fetched and results are stored in state.
    *   **Updated Claim Logic:** `handleClaimPermit` (in `DashboardPage.tsx`) now re-verifies stored prerequisite check results before calling `writeContractAsync`.
    *   **Enhanced UI Feedback:** The permit table (now `PermitRow.tsx`) displays warnings ("Owner Balance Low", "Permit2 Allowance Low", "Check Failed") and updates button state/text based on prerequisite checks, using CSS classes for styling.
    *   **Implemented Multicall Utility:** Created `frontend/src/utils/multicall-utils.ts` containing the `claimMultiplePermitsViaMulticall` function. This function uses `viem` and `Multicall3.aggregate3` to bundle multiple `Permit2.permitTransferFrom` calls into a single transaction, accepting `PublicClient`, `WalletClient`, permit details, and contract addresses.
    *   **Refactored Components (Previous):** Extracted `LoginPage`, `DashboardPage`, and `GitHubCallback` from `App.tsx` into `frontend/src/components/`.
    *   **Fixed Fetching Bug:** Resolved issue causing multiple permit fetches by removing redundant fetch calls and adjusting `useEffect` dependencies.
    *   **Fixed Button Disabling:** Corrected logic that incorrectly disabled claim buttons.
    *   **Integrated Grid Background:** Imported and executed the `grid` function from `frontend/src/the-grid.ts` within `main.tsx`, targeting the `#grid` element in `index.html`. Imported `grid-styles.css` and `ubiquity-styles.css`. Verified `index.html` structure includes `<background>` and `<main>`.
    *   **Added Header Logo:** Implemented SVG logo display by importing the raw SVG content (`ubiquity-os-logo.svg?raw`) and rendering it using `dangerouslySetInnerHTML` within a `<span>` in `LoginPage.tsx` and `DashboardPage.tsx`. Updated `vite-env.d.ts` for `?raw` imports. Adjusted CSS (`.header-logo-wrapper svg`) to style the injected SVG. (This approach bypasses issues with `vite-plugin-svgr`).
    *   **Refactored Authentication:** Replaced GitHub OAuth flow with Wallet Connection (`wagmi`) as the primary authentication/access method. Updated `LoginPage.tsx` to use `useConnect`, updated `App.tsx` to use `useAccount` for conditional rendering, removed `auth-context.tsx`, `github-callback.tsx`, and related routing/logic.
    *   **Optimized Worker Validation & Caching (2025-04-01):**
        *   Refactored `usePermitData` hook and `permit-checker.worker.ts` to implement caching and optimized fetching/validation.
        *   The hook now caches full `PermitData` objects (including validation status) and the last check timestamp in `localStorage`.
        *   On load, the hook displays cached data immediately and sends a single `FETCH_AND_VALIDATE` message to the worker, including the last check timestamp.
        *   The worker fetches permits from Supabase (all if no valid timestamp, only new if timestamp provided, using `created` column and correct `github_id` for `beneficiary_id`), maps them (assuming ERC20), validates the fetched set via batch RPC (`rpcClient`), and returns the complete validated list.
        *   The hook receives the validated list, merges it into the cache, saves the cache and new timestamp, and updates the UI.
        *   The `usePermitClaiming` hook updates the `localStorage` cache immediately on successful claims.
        *   Worker logic assumes ERC20 only, based on positive amount. NFT logic removed.
    *   **Reward Preference & CowSwap Integration (Placeholder):**
        *   Added `RewardPreferenceSelector.tsx` component allowing users to select a preferred reward token (saved to `localStorage`).
        *   Created `constants/supported-reward-tokens.ts` to define tokens per chain (using placeholders for Gnosis UUSD).
        *   Integrated the selector into `DashboardPage.tsx`.
        *   Created `utils/cowswap-utils.ts` with placeholder functions (`getCowSwapQuote`, `initiateCowSwap`) for CowSwap interaction. Added `@cowprotocol/cow-sdk` dependency.
        *   Modified `hooks/use-permit-data.ts` to fetch placeholder quotes based on preference, store estimates (`estimatedAmountOut`, `quoteError`) in permit data, and update UI accordingly.
        *   Modified `hooks/use-permit-claiming.ts` to trigger placeholder `initiateCowSwap` after successful sequential claims and added state (`swapSubmissionStatus`) for UI feedback.
        *   Updated `PermitsTable.tsx` and `PermitRow.tsx` to display estimated amounts and quoting status.
        *   Updated `DashboardPage.tsx` to display estimated total value and swap submission status.
*   **Shared Types**:
    *   Added `ownerBalanceSufficient`, `permit2AllowanceSufficient`, `checkError` fields to `PermitData` for storing prerequisite check results.
    *   Added `estimatedAmountOut` (string) and `quoteError` (string | null) fields to `PermitData` for quote results.
*   **Docs**:
    *   Updated `product-context.md`, `system-patterns.md`, and `active-context.md` to reflect the wallet-first authentication flow. Removed `github-auth-flow.md`.
    *   Updated `system-patterns.md` (2025-04-01) to detail the simplified fetch/validate flow and `localStorage` caching strategy.
*   **Cleanup & Refactoring (2025-03-30):**
    *   **Removed Unused Code:** Deleted the `backend/scanner/` directory and the `frontend/src/components/icons.tsx` component.
    *   **Removed Unused Dependency:** Removed `vite-plugin-svgr` from root and frontend `package.json` files and `frontend/vite.config.ts`.
    *   **Refactored DashboardPage (Hooks):** Extracted data fetching logic into `frontend/src/hooks/use-permit-data.ts` and claiming logic into `frontend/src/hooks/use-permit-claiming.ts`. Updated `DashboardPage.tsx` to use these hooks, reducing its line count significantly.
*   **Infrastructure**:
    *   **Frontend Deployment:** Added `frontend/server.ts` to serve the built static assets (from `frontend/dist`) on Deno Deploy, handling SPA routing.
    *   **Deployment Script:** Created `scripts/deploy-frontend.sh` to automate the frontend build (`bun run build` in `frontend/`) and deployment to Deno Deploy using `deployctl`. Sanitized project name (lowercase, dots to hyphens) for Deno Deploy compatibility.
    *   **Package Script:** Added `deploy` script to `frontend/package.json` (`bun run deploy`) which executes the deployment shell script.
    *   **Documentation:** Updated `frontend/README.md` with setup, build, and deployment instructions.

## 3. Next Steps (Immediate)

*   **Verify Pre-Claim Checks**: Confirm the new balance/allowance checks accurately reflect on-chain state and prevent claims appropriately.
*   **Test Claiming**: Thoroughly test the single permit claim flow with the new checks in place.
*   **RPC Error Handling**: Improve backend validation functions (`isErc20NonceClaimed`, `isErc721NonceClaimed`) to better handle RPC errors (e.g., return a specific error state instead of fail-safe `true`).
*   **Implemented Transaction Recording**: Added backend endpoint `/api/permits/record-claim` to record successful claims with transaction hash and URL.
*   **(Backend)** Ensure backend API (`/api/permits`) correctly fetches permits based on the provided `walletAddress` query parameter.
*   **Implement Real CowSwap Logic**: Replace placeholder functions in `cowswap-utils.ts` with actual SDK calls, including handling signing via `viem` WalletClient.
*   **Obtain UUSD Address**: Get the correct Gnosis Chain address for UUSD and update `supported-reward-tokens.ts`.
*   **Refactor to Multicall Claiming (Optional but Recommended)**: Replace sequential claiming in `usePermitClaiming` with a multicall approach (using a library or custom implementation) before triggering swaps for better UX and efficiency. The previously mentioned `multicall-utils.ts` was not found.
    *   **Test End-to-End Flow**: Thoroughly test selection, quoting, claiming, and swapping (once implemented).
    *   **Verify Frontend Deployment**: Check deployed URLs.
    *   **Handle Network Mismatch (2025-04-02):** Implemented logic in `PermitRow.tsx` to detect when a permit's network (`permit.networkId`) differs from the connected wallet's network (`chain.id`). If mismatched, the component now displays the correct token amount but renders a "Switch to [Network Name]" button using `wagmi`'s `useSwitchNetwork` hook instead of the "Claim" button. Added `NETWORK_NAMES` constant in `config.ts`.

## 4. Key Decisions / Open Questions

*   **Decisions Made:**
    *   Styling: Raw CSS
    *   Blockchain Library: `viem`
    *   Wallet Connector: `wagmi`
    *   Repository Structure: Standard repository
    *   Unit/Integration Testing: `bun test`
    *   Backend Platform: Deno Deploy
    *   Backend Routing: Hono
    *   Frontend Framework: React
    *   GitHub Scanning Strategy: User-triggered via API using stored user OAuth token.
    *   Multicall Contract: Use existing deployed contracts (for future batching).
    *   RPC Management: Use existing custom RPC handler (needs rewrite eventually).
    *   Frontend Hosting: Deno Deploy.
    *   Authentication: Wallet Connection (`wagmi` on frontend). Backend assumes authenticated access via wallet address.
    *   Beneficiary Fetching: Using two-step query in backend (assuming permits are linked to wallets).
    *   Reward Preference Storage: Use `localStorage`.
    *   Supported Reward Tokens: Defined in a constant file per chain.
    *   Claim/Swap Order: Claim sequentially first, then trigger batched swaps (due to lack of multicall claim implementation).
    *   Swap Error Handling: Notify user, no automatic retries.
*   **Remaining Questions:**
    *   **CowSwap SDK Usage:** How to correctly initialize and use `@cowprotocol/cow-sdk` with `viem`'s `WalletClient` for signing?
    *   **UUSD Address (Gnosis):** What is the correct contract address?
    *   How are permits initially associated with wallet addresses in the database? (External process assumed).
    *   Best strategy for handling intermittent RPC errors during validation (currently basic error messages are set in the worker).
    *   Database schema details (confirmation needed).
    *   RPC endpoint reliability (`https://rpc.ubq.fi/100`).

*(This document will be updated frequently as work progresses.)*

## 2025-05-18

- Updated the `/api/permits/record-claim` endpoint in `backend/server.ts`:
  - Now updates the `transaction` column in the `permits` table using the provided `nonce` and `transactionHash`.
  - Removed all references to `claimer_address`.
  - Endpoint returns a clear success or error response.
