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
    *   **Implemented Pre-Claim Checks:** Added checks for owner balance and Permit2 allowance within `DashboardPage` before initiating a claim. These checks run after permits are fetched and results are stored in state.
    *   **Updated Claim Logic:** `handleClaimPermit` now re-verifies stored prerequisite check results before calling `writeContractAsync`.
    *   **Enhanced UI Feedback:** The permit table now displays warnings ("Owner Balance Low", "Permit2 Allowance Low", "Check Failed") and updates button state/text based on prerequisite checks.
    *   **Refactored Components:** Extracted `LoginPage`, `DashboardPage`, and `GitHubCallback` from `App.tsx` into `frontend/src/components/` to reduce file size and improve organization.
    *   **Fixed Fetching Bug:** Resolved issue causing multiple permit fetches by removing redundant fetch calls and adjusting `useEffect` dependencies.
    *   **Fixed Button Disabling:** Corrected logic that incorrectly disabled claim buttons.
*   **Shared Types**:
    *   Added `ownerBalanceSufficient`, `permit2AllowanceSufficient`, `checkError` fields to `PermitData` for storing prerequisite check results.

## 3. Next Steps (Immediate)

*   **Verify Pre-Claim Checks**: Confirm the new balance/allowance checks accurately reflect on-chain state and prevent claims appropriately.
*   **Test Claiming**: Thoroughly test the single permit claim flow with the new checks in place.
*   **RPC Error Handling**: Improve backend validation functions (`isErc20NonceClaimed`, `isErc721NonceClaimed`) to better handle RPC errors (e.g., return a specific error state instead of fail-safe `true`).
*   **(Optional)** Implement backend endpoint `/api/permits/update-status` to record successful claims.
*   **Implement GitHub Scanning**: Add logic to backend to scan GitHub for new permits.

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
    *   Authentication: Custom backend flow with JWT sessions.
    *   Beneficiary Fetching: Using two-step query in backend.
*   **Remaining Questions:**
    *   Best strategy for handling intermittent RPC errors during validation.
    *   Implementation details for batch claiming (Phase 4/5).
    *   Database schema details (confirmation needed for all tables/columns/relationships).
    *   Encryption for GitHub token storage.
    *   Is the current RPC endpoint reliable enough, or should we switch (as previously discussed)? The pre-claim checks might mitigate the need if the issue was allowance/balance.

*(This document will be updated frequently as work progresses.)*
