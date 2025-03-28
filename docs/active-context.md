# Active Context: Permit Claiming Application (Rewrite)

**Date:** 2025-03-29

## 1. Current Focus

*   Debugging permit validation in the frontend (`hasRequiredFields` function).
*   Implementing and testing the actual permit claiming transaction (`handleClaimPermit` function using Permit2 `permitTransferFrom`).
*   Addressing intermittent RPC errors during backend validation.

## 2. Recent Changes

*   **Backend API**:
    *   Implemented `/api/permits` endpoint with logic to fetch permits, related data (token, owner, location), and beneficiary wallet address (using a two-step query). Includes on-chain validation checks (though currently affected by RPC errors).
    *   Implemented `/api/wallet/link` endpoint to update user's wallet address in `permit_app_users`.
    *   Implemented `/api/permits/test` endpoint for frontend validation checks (fetches owner address separately).
    *   Fixed various database query issues (joins, column names).
*   **Frontend**:
    *   Implemented basic dashboard UI using React and `wagmi`.
    *   Added wallet connection (`useConnect`, `useAccount`).
    *   Added logic to fetch and display permits from the backend.
    *   Implemented `hasRequiredFields` check (currently under debug).
    *   Added "Test Claim" button logic (now superseded by "Claim" button).
    *   Added initial "Claim" button logic using `useWriteContract` and `useWaitForTransactionReceipt`.
    *   Improved UI display (amount formatting, status colors, source link).
*   **Shared Types**: Refined `PermitData` interface.

## 3. Next Steps (Immediate)

*   **Debug `hasRequiredFields`**: Add more logging or refine checks in the frontend function to understand why it's still failing for valid permits (likely missing `owner` or `signature` in the data received).
*   **Verify Backend Data**: Ensure `/api/permits` correctly returns `owner` and `signature` fields within the `PermitData` objects.
*   **Finalize Claim Logic**: Complete and test the `handleClaimPermit` function, including UI state updates (Pending, Success, Error) and transaction hash display.
*   **RPC Error Handling**: Improve backend validation functions (`isErc20NonceClaimed`, `isErc721NonceClaimed`) to better handle RPC errors (e.g., return a specific error state instead of fail-safe `true`).
*   **(Optional)** Implement backend endpoint `/api/permits/update-status` to record successful claims.

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
    *   Why is `hasRequiredFields` still failing in the frontend? (Need to verify data received from backend).
    *   Best strategy for handling intermittent RPC errors during validation.
    *   Implementation details for batch claiming (Phase 4/5).
    *   Database schema details (confirmation needed for all tables/columns/relationships).
    *   Encryption for GitHub token storage.

*(This document will be updated frequently as work progresses.)*
