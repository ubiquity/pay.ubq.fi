# Active Context: Permit Claiming Application (Rewrite)

**Date:** 2025-03-29 (Updated)

## 1. Current Focus

*   Testing and verifying the recently implemented pre-claim checks (owner balance, Permit2 allowance) in the frontend.
*   Monitoring claim transactions to ensure the `TRANSFER_FROM_FAILED` error is resolved or properly diagnosed by the new checks.
*   Refining UI feedback related to prerequisite checks and claim status.

## 2. Recent Changes

*   **Backend API**:
    *   (No recent backend changes relevant to this update cycle)
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
*   **Shared Types**:
    *   Added `ownerBalanceSufficient`, `permit2AllowanceSufficient`, `checkError` fields to `PermitData` for storing prerequisite check results.
*   **Docs**:
    *   Updated `product-context.md`, `system-patterns.md`, and `active-context.md` to reflect the wallet-first authentication flow. Removed `github-auth-flow.md`.

## 3. Next Steps (Immediate)

*   **Verify Pre-Claim Checks**: Confirm the new balance/allowance checks accurately reflect on-chain state and prevent claims appropriately.
*   **Test Claiming**: Thoroughly test the single permit claim flow with the new checks in place.
*   **RPC Error Handling**: Improve backend validation functions (`isErc20NonceClaimed`, `isErc721NonceClaimed`) to better handle RPC errors (e.g., return a specific error state instead of fail-safe `true`).
*   **(Optional)** Implement backend endpoint `/api/permits/update-status` to record successful claims.
*   **(Backend)** Ensure backend API (`/api/permits`) correctly fetches permits based on the provided `walletAddress` query parameter.
*   **Integrate Multicall Claiming**: Update the UI (likely `PermitsTable.tsx` or `DashboardPage.tsx`) to allow selecting multiple permits and trigger the `claimMultiplePermitsViaMulticall` function.

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
*   **Remaining Questions:**
    *   How are permits initially associated with wallet addresses in the database? (External process assumed).
    *   Best strategy for handling intermittent RPC errors during validation.
    *   UI design for selecting multiple permits for batch claiming.
    *   Database schema details (confirmation needed for all tables/columns/relationships, especially wallet-permit linkage).
    *   Is the current RPC endpoint reliable enough, or should we switch (as previously discussed)? The pre-claim checks might mitigate the need if the issue was allowance/balance.

*(This document will be updated frequently as work progresses.)*
