# Permit Not Showing Bug - Handoff Documentation

## Issue Summary
GitHub issue #421: Permits not showing up in the UI despite being present in the database.

## Status: PARTIALLY RESOLVED
- Database queries: ✅ WORKING (385 permits found)
- Basic validation: ✅ WORKING (335 permits pass validation)  
- Nonce deduplication: ✅ FIXED (was marking all permits as duplicates)
- **Frontend filtering: ❌ STILL BROKEN** - permits still showing "0 rewards pending"

## What We've Confirmed Works

### 1. Database Layer is Perfect
- Direct database query finds 385 permits for wallet `0x4007CE2083c7F3E18097aeB3A39bb8eC149a341d`
- Specific permit ID 1846 exists and has correct relationships:
  ```json
  {
    "id": 1846,
    "amount": "1260000000000000000", 
    "nonce": "37903025654497830078926798853589289520908972598977474259770938429919890846887",
    "signature": "0x74d8d7049d0fde7e74c682a740916309b93b0cc6394fdc1f93ce33288076c1b60cf73d80cf208b3b76dc6eca86ceba867903b8d4f83e607e03c70ff2ee15e2431c",
    "token_id": 2,
    "partner_id": 1, 
    "beneficiary_id": 4975670,
    "transaction": null
  }
  ```
- Beneficiary relationship correctly links to wallet `0x4007CE2083c7F3E18097aeB3A39bb8eC149a341d`
- Token data: `0xC6ed4f520f6A4e4DC27273509239b7F8A68d2068` on network 100 (Gnosis)

### 2. Worker Processing Works
- Worker successfully fetches 385 permits from database
- Basic validation passes for 335 permits (filters out 50 with missing data)
- Worker processes and returns permits to frontend

### 3. Previous Fixes Applied
- Fixed `lastCheckTimestamp` parameter in `FETCH_NEW_PERMITS` payload
- Fixed nonce deduplication logic that was marking ALL permits as duplicates
- Added RPC error logging in frontend filtering

## Current Issue: All Permits Still Being Filtered Out

### Browser Console Shows:
```
Worker: Found 385 permits as beneficiary
Worker: Total unique permits: 385  
Worker: Filtered out 50 invalid permits from 385 total
[Permit 0xf778cdc7...] Validation error: permit with same nonce but higher amount exists
[Permit 0x3cf36613...] Validation error: permit with same nonce but higher amount exists
[...many more similar errors...]
```

**The nonce deduplication logic is STILL not working correctly** despite the fix.

## Files Involved

### Primary Files to Debug:
1. `src/frontend/src/workers/permit-checker.worker.ts` (lines 634-662) - Nonce deduplication logic
2. `src/frontend/src/hooks/use-permit-data.ts` (lines 101-125) - Frontend filtering
3. `src/frontend/src/components/permits-table.tsx` - UI display

### Key Functions:
- `validatePermitsBatch()` in worker - On-chain validation and nonce deduplication  
- `filterPermits()` in use-permit-data.ts - Frontend filtering of permits
- Database queries in `fetchPermitsFromDb()` - Working correctly

## Debugging Strategy for Next Developer

### Step 1: Verify Nonce Deduplication Logic
The issue is in `permit-checker.worker.ts` around lines 634-662. Current console logs show ALL permits are getting marked as duplicates, which shouldn't happen.

**Key questions to answer:**
1. Are the permits actually having identical nonces, or is the grouping logic wrong?
2. Is the `permitsByNonce` Map being created correctly?
3. Is the "passing" permit selection working?

**Debug approach:**
Add console logs in the nonce deduplication section:
```typescript
// Add this in the worker around line 627
console.log("=== NONCE DEDUPLICATION DEBUG ===");
console.log("Total permits before dedup:", finalPermits.length);
console.log("Unique nonces:", permitsByNonce.size);

for (const [nonce, nonceGroup] of permitsByNonce.entries()) {
  console.log(`Nonce ${nonce.substring(0, 10)}...: ${nonceGroup.length} permits`);
  if (nonceGroup.length > 1) {
    console.log("  Multiple permits for this nonce - will dedupe");
    nonceGroup.forEach((p, i) => console.log(`    ${i}: ${p.signature.substring(0, 10)}... amount: ${p.amount}`));
  }
}
```

### Step 2: Check Individual Permit Nonces
If the deduplication logic shows that permits have unique nonces but are still being marked as duplicates, there's a deeper bug.

**Expected behavior:**
- If permits have unique nonces: NO permits should be marked as duplicates
- If permits share nonces: Only the highest value permit should pass

### Step 3: Frontend Filtering Review
Even if some permits have the "duplicate" error, the frontend filtering in `use-permit-data.ts` should still show permits that don't have that specific error.

Current logic (lines 117-121):
```typescript
const definitelyUsed = permit.isNonceUsed === true;
const definitelyClaimed = permit.status === "Claimed"; 
const hasNonceError = !!(permit.checkError && permit.checkError.toLowerCase().includes("nonce"));
const shouldFilter = definitelyUsed || definitelyClaimed || hasNonceError;
```

**The `hasNonceError` check might be too broad** - it catches "permit with same nonce but higher amount exists" errors.

### Step 4: Temporary Bypass for Testing
To confirm this is the issue, temporarily comment out the nonce deduplication entirely:

In `permit-checker.worker.ts`, comment out lines 634-662:
```typescript
// TEMPORARY: Skip nonce deduplication to test
/*
// check duplicated permits by nonce  
for (const nonceGroup of permitsByNonce.values()) {
  // ... entire nonce deduplication logic
}
*/
```

If permits show up after this, the deduplication logic is definitely the problem.

## Expected Fix
The nonce deduplication logic should:
1. Only run when permits actually share the same nonce
2. Properly select the highest value permit from each nonce group
3. NOT mark permits with unique nonces as duplicates

The frontend filtering should:
1. Allow permits with minor validation issues to show
2. Only filter out permits that are definitively unusable

## Test Wallet
Use wallet `0x4007CE2083c7F3E18097aeB3A39bb8eC149a341d` for testing - it has 385 permits in the database.

## Success Criteria  
- Permits visible in UI showing "X rewards pending" instead of "0 rewards pending"
- Console logs show permits passing through filtering logic
- Specific permit ID 1846 should be visible in the UI

## Environment
- Database: Working correctly (confirmed with direct queries)
- RPC: Working correctly (confirmed with test calls)
- Frontend: React 19 with Web Workers for permit processing