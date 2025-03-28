# Distilled Active Context: Permit Claiming App Rewrite (Detailed)

**Date:** 2025-03-28 (End of Session)

## 1. Project Goal & Strategy

*   **Goal:** Rewrite `pay.ubq.fi` to focus *only* on GitHub Permit discovery (from existing DB), on-chain validation, and batch claiming. Remove all gift card/Reloadly features.
*   **Strategy:** Use existing Supabase `permits` table (populated externally) as the source of potential permits. Users log in via GitHub (custom backend flow), connect their wallet, and the app fetches/validates permits linked to their GitHub ID via the `permits.beneficiary_id` column.

## 2. Architecture & Tech Stack (Finalized Decisions)

*   **Frontend:** React SPA (TypeScript/Vite/Bun). Raw CSS. `react-router-dom`, `wagmi`, `viem`, `@tanstack/react-query`. Deployed on Deno Deploy.
*   **Backend:** Deno API using Hono framework. Deployed on Deno Deploy. Uses `viem` for blockchain interaction, `@supabase/supabase-js` for DB, `djwt` for session tokens. Loads local `.env` via `deno-dotenv`.
*   **Database:** Existing Supabase instance.
    *   **Reads:** `permits`, `wallets`, `tokens`, `partners`.
    *   **Writes:** `permit_app_users` (new table created via MCP).
*   **Authentication:** Custom backend OAuth flow using GitHub. Backend exchanges code, fetches profile (non-fatal), upserts user to `permit_app_users`, generates JWT (stored in `localStorage` on frontend). JWT verified by backend middleware for protected routes.
*   **Testing:** `bun test` (Unit/Integration), React Testing Library (Component). No Cypress E2E.
*   **Repo Structure:** Standard multi-directory repo (`frontend/`, `backend/api/`, `shared/`), not a managed monorepo.

## 3. Implemented Functionality & Status

*   **Project Setup:**
    *   Directory structure created.
    *   Docs initialized.
    *   Frontend scaffolded with Vite/React, dependencies installed.
    *   Backend Deno API project initialized.
    *   `.env` files created for frontend and backend API.
    *   Shell scripts created for running dev servers (`dev-frontend.sh`, `dev-backend-api.sh`).
*   **Database:**
    *   `permit_app_users` table created via MCP with `github_id` (PK, TEXT), `username` (TEXT, NULL), `avatar_url` (TEXT, NULL), `wallet_address` (TEXT, NULL, UNIQUE?), `encrypted_github_token` (TEXT, NULL), `created_at`, `updated_at`. RLS policies added via MCP to allow `anon` role INSERT/UPDATE/SELECT. `github_login` and `avatar_url` made nullable via MCP. **NOTE:** `encrypted_github_token` column exists but is currently unused due to strategy change.
    *   `discovered_permits` table created via MCP with relevant columns, indexes, and RLS policies. **NOTE:** This table is currently unused as we switched to reading from the existing `permits` table.
*   **Backend API (`backend/api/main.ts`):**
    *   **Initialization:** Loads `.env`, initializes Supabase client, initializes JWT key. **Status: Working.**
    *   **CORS:** Manual CORS middleware implemented as workaround. **Status: Working.** (Hono middleware imports failed).
    *   **Logger:** Commented out due to import errors. **Status: Non-functional.**
    *   **JWT Middleware:** Verifies JWT from `Authorization` header. **Status: Working.**
    *   **Auth Callback (`POST /api/auth/github/callback`):** Exchanges GitHub code for token, fetches profile (handles 401 non-fatally), upserts user data (`github_id`, `username`, `avatar_url`) into `permit_app_users`, generates JWT. **Status: Working.** (Does not store GitHub token).
    *   **Wallet Linking (`POST /api/wallet/link`):** Authenticated endpoint. Updates `wallet_address` in `permit_app_users` for the JWT user. **Status: Implemented.**
    *   **Permit Fetching (`GET /api/permits`):** Authenticated endpoint. Fetches user's `wallet_address` from `permit_app_users`, finds `wallet_id` from `wallets`, queries existing `permits` table joining `tokens` and `partners`, filters by `beneficiary_id` and `transaction IS NULL`, performs on-chain validation (deadline, nonce status via `viem`), returns valid permits. **Status: Implemented but returning empty array due to validation issues.**
    *   **On-Chain Validation:** Functions `isErc20NonceClaimed` and `isErc721NonceClaimed` implemented using `viem`. Type determination logic based on `amount`/`token_id`. **Status: Implemented but likely filtering out all permits incorrectly.**
*   **Frontend (`frontend/src/App.tsx`, etc.):**
    *   **Routing:** `BrowserRouter`, routes for `/` and `/github/callback`. **Status: Working.**
    *   **Auth:** `AuthProvider` context, `useAuth` hook, `localStorage` for JWT. **Status: Working.**
    *   **Login:** `LoginPage`, redirect to GitHub (`handleLogin`). **Status: Working.**
    *   **Callback:** `GitHubCallback` component handles redirect, sends code to backend, calls `login` on success. Guard against double submission implemented. **Status: Working.**
    *   **Dashboard:** `DashboardPage` displayed for logged-in users. **Status: Working.**
    *   **Wallet Connect:** Uses `wagmi`, `QueryClientProvider`. Connect/Disconnect buttons, displays address. Calls `/api/wallet/link` on connect. **Status: Working.**
    *   **Permit Fetch/Display:** `fetchPermits` calls `/api/permits` on mount and after wallet link. Displays results in a table. **Status: Fetch call works, but receives empty array, displays "No permits...".**

## 4. Current Issue / Blockers

*   **Primary Blocker:** The `GET /api/permits` endpoint returns `[]` despite the database containing potential permits for the user.
*   **Root Cause:** The on-chain validation logic within `GET /api/permits` is incorrectly filtering out all permits. Backend logs show:
    *   Many permits skipped due to "missing token data (address/network)", indicating issues with the Supabase JOIN between `permits` and `tokens` or missing data in the `tokens` table.
    *   Some permits skipped due to "Cannot determine permit type".
    *   The permits that *are* validated are all being marked as claimed/invalid (e.g., `Permit nonce X already claimed on-chain`).
*   **Debugging Needed:** Investigate the Supabase query join, the data integrity in `permits` and `tokens` tables, and the correctness of the `isErc20NonceClaimed` / `isErc721NonceClaimed` functions against actual on-chain data for specific permits known to be valid.

## 5. Next Steps

1.  **Debug Permit Fetching/Validation:**
    *   Verify the Supabase query in `GET /api/permits` correctly joins `permits` and `tokens` and returns `address` and `network`.
    *   Add detailed logging within `isErc20NonceClaimed` and `isErc721NonceClaimed` to see the exact parameters used and results returned from `viem.readContract`.
    *   Manually verify the on-chain status of a specific permit expected to be valid and compare it to the backend validation result.
2.  **Implement Claiming:** Once permits are displayed, implement the frontend batch claiming logic (`handleClaim`) and the backend status update (`POST /api/permits/update-status`).
3.  **Refine & Secure:** Implement proper token encryption/decryption, add robust error handling, refine UI, review RLS policies for production.
