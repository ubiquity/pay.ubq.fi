# Issue 431: Enhanced permit data management + batch claiming

Tracking: https://github.com/ubiquity/pay.ubq.fi/issues/431  
Primary PR context: https://github.com/ubiquity/pay.ubq.fi/pull/448

## Goal

Make permit loading and “claim all” flows reliable and performant for both:

- **Beneficiaries** (wallet that can claim permits)
- **Funding wallets** (wallet that owns permits and can invalidate them)

Key outcomes:

- Permits load correctly for both owners and beneficiaries.
- Batch claiming works consistently and uses `permitsToClaim` rather than implicitly claiming “everything”.
- Permits clear correctly on wallet/account changes.
- Performance improves via caching / reduced unnecessary work.

## Current State (already implemented)

### A) Worker fetches permits for beneficiary + owner

- Worker queries Supabase for:
  - Beneficiary permits (`users.wallets.address` matches)
  - Owner permits (`partner.wallet.address` matches)
- Both queries filter to unclaimed rows: `.is("transaction", null)`
- Results are deduped by permit `id`.
  - `src/workers/permit-checker.worker.ts:166`

### B) Worker validates nonce + balance + allowance via batch RPC

- Nonce bitmap check sets `isNonceUsed` and sets `status` to `"Claimed"` or `"Valid"`.
- Shared balance/allowance checks populate `ownerBalanceSufficient`, `permit2AllowanceSufficient`, plus `balancesAndAllowances` map.
  - `src/workers/permit-checker.worker.ts:313`

### C) Frontend uses worker results + filters out claimed/used permits

- Worker results are stored and filtered to “pending permits”:
  - `src/hooks/use-permit-data.ts:37`

### D) Claim-all flow passes explicit permits list (permitsToClaim)

- `DashboardPage` computes `claimablePermits` and passes that list into `claimPermits(permitsToClaim)`.
  - `src/components/dashboard-page.tsx:184`

## Critical Gaps / Bugs (must-fix)

### 1) Permit localStorage cache is effectively broken (BigInt JSON)

`usePermitData.saveCache()` attempts `JSON.stringify()` on `PermitData` objects that contain `bigint` (e.g., `amount`).

- `JSON.stringify(bigint)` throws.
- The function catches and silently ignores, so cache is never written.
  - `src/hooks/use-permit-data.ts:29`

Because of that, `updatePermitStatusCache()` is usually a no-op (cache entry missing), so status updates don’t persist across reloads:

- `src/hooks/use-permit-data.ts:224`

This is directly related to “better caching” and to stable UX after claim/invalidate actions.

### 2) Worker supports `lastCheckTimestamp` but the frontend never uses it

`WorkerRequest` includes `lastCheckTimestamp?: string | null`, but `usePermitData` always sends only `{ address }`.

- `src/workers/permit-checker.worker.ts:13`
- `src/hooks/use-permit-data.ts:203`

If we want incremental fetching, we must also change the frontend to merge new permits rather than overwrite.

## Scope (what to build)

### A) Replace/repair permit caching (no BigInt in localStorage)

Implement a small, serializable cache focused on what we actually need to persist:

- Permit status overrides by signature:
  - `status` (`"Claimed" | "Valid" | ...`)
  - `isNonceUsed?: boolean`
  - `transactionHash?: string`
  - `updatedAt: number` (ms)

Avoid caching the full `PermitData` object (it contains `bigint` and volatile fields like quote estimates).

Recommended structure:

- Key: `permitStatusCache:<chain-agnostic>:<walletAddressLower>`
- Value: `{ [signatureLower: string]: { status?: string; isNonceUsed?: boolean; transactionHash?: string; updatedAt: number } }`

#### Integration points

1. In `usePermitData`, after receiving validated permits from the worker:
   - Load status overrides for the current wallet from localStorage.
   - Merge overrides into each permit before placing into `allPermitsRef` / state.
2. Update `updatePermitStatusCache()` to:
   - Write into the status cache (always serializable).
   - Update `allPermitsRef.current` in-memory so the UI updates immediately.

This makes “status persistence” reliable without fighting BigInt serialization.

### B) Wallet/account switching behavior

Ensure switching accounts doesn’t leak cached status between wallets:

- Cache keys must include the connected wallet address.
- On `address` change:
  - Clear in-memory refs (`allPermitsRef`) immediately.
  - Reset `permits` to `[]`.
  - Then fetch for the new address.

### C) Optional performance upgrade: incremental fetch with `lastCheckTimestamp`

Only implement if it can be done without destabilizing the flow.

If implemented, do it as:

1. Store a per-wallet `lastCheckTimestamp` (ISO string) in localStorage:
   - Key: `permitLastCheck:<walletAddressLower>`
2. On fetch:
   - Send `payload: { address, lastCheckTimestamp }`
3. On response:
   - Merge `validatedNewPermits` into `allPermitsRef.current` by signature (do not overwrite).
   - Update `lastCheckTimestamp` to the max `created` seen.

Important: decide how to handle revalidation of older permits:

- Minimal: only validate new permits (fastest).
- Safer: periodically revalidate everything (e.g., on interval or user action), because balances/allowances can change over time.

## Acceptance Criteria (Definition of Done)

- Caching:
  - Permit status overrides (claimed/invalidated + txHash) persist across page reloads.
  - No runtime errors related to `JSON.stringify(BigInt)`.
- Data correctness:
  - Permits show for both beneficiaries and owners as before.
  - Switching wallet accounts clears the prior permits immediately and loads the new account’s permits.
- Batch claiming:
  - Claim-all uses the explicit list of claimable permits (current behavior must not regress).
  - After successful claim, the UI updates to remove claimed permits and the status cache is updated.

## Files (expected touch set)

- `src/hooks/use-permit-data.ts`
- (Optional) `src/workers/permit-checker.worker.ts` (only if incremental fetch/merge requires it)
- (Optional new helper) `src/utils/permit-status-cache.ts`

## Manual QA Checklist

1. Connect as a beneficiary wallet with pending permits:
   - Verify permits load and are claimable where expected.
2. Click “Claim all”:
   - Confirm permits transition to claimed and disappear from pending list.
3. Hard reload the page:
   - Confirm claimed permits stay gone (status cache applied) even before DB updates propagate.
4. Switch wallet accounts (still connected):
   - Confirm old permits clear immediately.
   - Confirm new permits load for the new wallet.
5. (If incremental fetch implemented) Reload again:
   - Confirm the worker request includes `lastCheckTimestamp` and results are merged, not overwritten.
