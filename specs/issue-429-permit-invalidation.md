# Issue 429: Permit invalidation functionality

Tracking: https://github.com/ubiquity/pay.ubq.fi/issues/429  
Primary PR context: https://github.com/ubiquity/pay.ubq.fi/pull/448

## Goal

Allow a funding wallet (permit owner) to invalidate an ERC20 Permit2 permit from the UI, with clear user feedback:

- The invalidation transaction is submitted on the correct chain.
- The UI shows “invalidating” progress and success/failure states.
- On success, the transaction hash is surfaced to the user (and can be opened in a block explorer).
- Invalidated permits disappear from the “pending permits” list.

## Current State (already implemented)

- Hook exists and performs Permit2 invalidation with `invalidateUnorderedNonces`:
  - `src/hooks/use-permit-invalidation.ts:34`
- The permit row can switch networks and offers an **Invalidate** action when the connected wallet is the permit owner:
  - `src/components/permit-row.tsx:60`
- `DashboardPage` wires invalidation into the table:
  - `src/components/dashboard-page.tsx:164`
- On success the permit is marked as `status: "Claimed"`, `isNonceUsed: true`, and filtered out of the list:
  - `src/hooks/use-permit-invalidation.ts:72`
  - Filtering happens in `src/hooks/use-permit-data.ts:37`

## Gaps vs Acceptance Criteria

### 1) “Transaction hashes are captured and displayed”

The tx hash is captured in code (`transactionHash` is set on the permit), but the row is immediately filtered out, so users never see the hash.

### 2) “User feedback / invalidating visuals”

`PermitRow` applies `row-invalidating`, but CSS does not define it (so invalidation looks identical to normal rows).

### 3) Optional: surface invalidation-specific errors

`usePermitInvalidation` tracks `invalidationError`, but nothing renders it. The global `setError()` path _is_ rendered already, so this is not strictly blocking, but it’s easy to improve clarity.

## Proposed UX (minimal + merge-friendly)

Add a small, dismissible “Last transaction” banner (or toast-like inline panel) on the dashboard that appears after a successful invalidation and includes:

- Action type: “Invalidated permit”
- Network name / chain id
- Tx hash (shortened) + “View on explorer” link

This avoids keeping invalidated permits in the table (so we still satisfy “removed from UI”) while giving users the tx hash.

## Implementation Plan

### A) Add a dashboard-level “Tx Banner” component

1. Create `src/components/tx-banner.tsx` (new file) that accepts:
   - `txHash: string`
   - `chainId: number`
   - `label: string` (e.g., `"Permit invalidated"`)
   - `onDismiss: () => void`
2. The component:
   - Finds the chain explorer base URL from `config.chains` (same source used by `PermitRow` for switchability).
   - Renders:
     - A short label
     - A monospace shortened hash (e.g., `0x1234…abcd`)
     - A button/link to `${explorerUrl}/tx/${txHash}`
     - A dismiss “×” button

Recommended styling: reuse existing app aesthetics (dark panel, subtle border). Keep it small and unobtrusive.

### B) Wire invalidation success → banner state in `DashboardPage`

1. Add local state in `src/components/dashboard-page.tsx`:
   - `lastTx: { txHash: string; chainId: number; label: string } | null`
2. Wrap the invalidation handler before passing into `PermitsTable`:
   - `const onInvalidatePermit = useCallback(async (permit) => { const res = await handleInvalidatePermit(permit); if (res.success && res.txHash) setLastTx({ txHash: res.txHash, chainId: permit.networkId, label: "Permit invalidated" }); return res; }, [...])`
3. Render `<TxBanner />` somewhere near the existing error sections so it’s visible even when the table collapses.

Notes:

- Keep `PermitRow` untouched (reduces merge conflicts with other work).
- Do not rely on `chain.blockExplorers` at the moment of render; use `permit.networkId` + `config.chains` for stable link generation.

### C) Add missing CSS for invalidation rows

1. Update `src/app-styles.css` to include:
   - `.permit-row.row-invalidating { ... }`
2. Suggested visuals:
   - Similar to `.row-claiming` but distinct (e.g., slightly different tint).
   - Keep opacity normal (unlike `.row-invalid` which dims).

### D) Optional (nice-to-have): show invalidation error inline

If desired, render a per-row error message when invalidation fails. Two low-conflict options:

1. Dashboard-only: show `setError()` already (no new work).
2. PermitRow-only: requires threading an `invalidationErrorBySignature` map — higher merge-conflict risk; avoid unless requested.

## Acceptance Criteria (Definition of Done)

- From a wallet that owns a displayed permit, clicking **Invalidate**:
  - Switches networks when needed.
  - Shows “Invalidating…” state on the row while pending.
  - On success, the permit disappears from the pending list.
  - A visible banner appears containing:
    - The transaction hash (shortened)
    - A working explorer link to the tx
- On invalidation failure:
  - Row returns to a non-loading state.
  - The user sees a clear error message (existing global error panel is sufficient).

## Files (expected touch set)

- `src/components/dashboard-page.tsx`
- `src/components/tx-banner.tsx` (new)
- `src/app-styles.css`

## Manual QA Checklist

1. Connect with a funding wallet that has pending permits.
2. Expand the table, locate a permit where `permit.owner === address`.
3. Click **Invalidate**:
   - If chain mismatch, confirm it prompts a chain switch first.
4. Confirm tx in wallet, wait for success.
5. Verify:
   - Row shows invalidating tint while pending.
   - Permit disappears after receipt success.
   - Banner shows tx hash and opens correct explorer.
6. Force a failure case (reject tx in wallet) and confirm error behavior.
