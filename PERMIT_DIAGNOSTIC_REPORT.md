# Permits Not Showing - Diagnostic Report

## Executive Summary

**Root Cause**: Commit `92f7337` introduced database query filters that reference non-existent columns, causing zero permits to be returned from the database layer.

**Status**: **CRITICAL REGRESSION** - Working functionality was broken by a refactoring commit
**Last Working Commit**: `1c2e7aeadda2d488d96ed626e2fe6cde8abc5922`
**Breaking Commit**: `92f7337da13424a6fb80d953f65a13a22d3bf756` ("refactor: remove PERMIT2 references and update permit fetching to use only PERMIT3")

## The Breaking Changes

### Critical Issue: Database Schema Mismatch

In commit `92f7337`, two database filters were re-introduced in `src/frontend/src/workers/permit-checker.worker.ts` lines 225-227 and 245-247:

```typescript
// BREAKING FILTER - Column doesn't exist
.eq("permit2_address", PERMIT3) // Only Permit3 permits
.filter("token.network", "eq", 100) // Only Gnosis Chain
```

**However, from the handoff document (`handoffs/permit-not-showing-bug.md` lines 226-227), we have clear evidence these filters were previously removed:**

```typescript
// NOTE: Removed permit2_address filter - column doesn't exist in current schema
// NOTE: Removed Gnosis Chain filter to test all networks
```

### Database Query Failure Chain

1. **Worker Query**: `fetchPermitsFromDb()` attempts to filter by `permit2_address` column
2. **Database Response**: Returns zero results because column doesn't exist or filter fails
3. **Worker Log**: Shows "Found 0 permits" instead of the expected 385 permits
4. **Frontend**: Receives empty permit array, displays "0 rewards pending"

## Analysis of Changes Between Working vs Broken State

### What Was Removed (The Good Parts)
- **PERMIT2 const

### What Was Added (The Bad Parts)
- **Database Filters**: Two problematic filters that reference non-existent columns:
  - `permit2_address` column (doesn't exist in current schema)
  - `token.network` nested filter (likely fails due to join issues)
- **Hardcoded Permit3**: All permits now forced to use PERMIT3 address without verification

### Evidence of Manual Debugging

**Current State Inconsistency**: The current file shows these filters are commented out:
```typescript
// NOTE: Removed permit2_address filter - column doesn't exist in current schema  
// NOTE: Removed Gnosis Chain filter to test all networks
```

But commit `92f7337` shows they were actively added. This suggests someone manually commented them out during debugging but never committed the fix.

## Root Cause Analysis

### 1. Database Schema Issues
The `permit2_address` column referenced in the filters likely doesn't exist in the current database schema. This causes the Supabase query to fail silently or return zero results.

### 2. Network Filtering Problems
The `token.network` filter may fail due to:
- Incorrect join syntax
- Missing network data in token relationships
- Case sensitivity issues with network IDs

### 3. Missing Validation
The refactoring removed address validation logic (`getPermit2Address()` function) but added rigid database filters without verifying the schema supports them.

## The Debugging History (from Handoff Document)

From `handoffs/permit-not-showing-bug.md`, we know that previous debugging attempts included:

1. **Database Layer**: ✅ CONFIRMED WORKING (385 permits found via direct queries)
2. **Worker Processing**: ✅ CONFIRMED WORKING (basic permit mapping)
3. **Nonce Deduplication**: ❌ STILL BROKEN (marking all permits as duplicates)
4. **Frontend Filtering**: ❌ STILL BROKEN (showing "0 rewards pending")

The handoff document shows the last step in the debugging process was trying to fix nonce deduplication, but they never identified that the database queries were returning zero results due to invalid filters.

## Critical Evidence

### Database Query Logs
Expected console output from working state:
```
Worker: Found 385 permits as beneficiary
Worker: Total unique permits: 385
Worker: Filtered out 50 invalid permits from 385 total
```

Current broken state output:
```
Worker: Found 0 permits as beneficiary  // ← THE REAL PROBLEM
Worker: Total unique permits: 0
```

### The Misdirection
Previous debugging focused on:
- Nonce deduplication logic (lines 634-662)
- Frontend filtering logic (use-permit-data.ts)
- RPC validation issues

But missed the fundamental issue: **NO PERMITS ARE BEING LOADED FROM THE DATABASE**

## File-by-File Impact Analysis

### `src/frontend/src/workers/permit-checker.worker.ts`
**Lines 225-227 & 245-247**: Added filters that break database queries
**Lines 158-170**: Removed address validation, forcing all permits to use PERMIT3
**Lines 288-316**: Removed `getPermit2Address()` function entirely

### `src/frontend/src/constants/config.ts`  
**Line 13**: Removed PERMIT2 constant (good change)

## The Fix Strategy

### Immediate Fix (High Priority)
1. **Remove the problematic filters** that were added in commit `92f7337`:
   ```typescript
   // REMOVE THESE LINES:
   .eq("permit2_address", PERMIT3) // Only Permit3 permits  
   .filter("token.network", "eq", 100) // Only Gnosis Chain
   ```

2. **Verify database schema** - confirm whether `permit2_address` column exists
3. **Test with broad queries** - remove restrictive filters to allow all permits through

### Verification Steps
1. **Database Direct Test**: Query permits table directly to confirm 385 permits exist
2. **Worker Console Test**: Check logs show "Worker: Found 385 permits" instead of "Found 0"
3. **UI Test**: Verify permits show in interface with correct counts

### Long-term Fixes (Medium Priority)
1. **Schema Validation**: Add database schema checks before deploying filter changes
2. **Migration Strategy**: If PERMIT2→PERMIT3 migration is needed, implement proper column migration
3. **Error Handling**: Add explicit error handling for failed database queries

## Testing Strategy

### 1. Database Layer Test
```bash
# Connect to Supabase and run direct query for wallet:
# 0x4007CE2083c7F3E18097aeB3A39bb8eC149a341d
# Should return 385 permits
```

### 2. Worker Test
Remove the filters and check console logs show:
```
=== DATABASE QUERY DEBUG ===
Beneficiary permits found: 385 (not 0)
Owner permits found: X
Combined permits: 385+
```

### 3. Frontend Test  
With permits loading correctly, UI should show:
```
"385 rewards pending" (not "0 rewards pending")
```

## Risk Assessment

**Severity**: **CRITICAL** - Core functionality completely broken
**Scope**: **ALL USERS** - No permits loading for any wallet  
**Business Impact**: **HIGH** - Users cannot see or claim rewards
**Technical Debt**: **MEDIUM** - Refactoring introduced schema assumptions without validation

## Recommendations

### Immediate Actions (Next 30 minutes)
1. **Revert the problematic filters** in `fetchPermitsFromDb()`
2. **Test with test wallet** `0x4007CE2083c7F3E18097aeB3A39bb8eC149a341d`
3. **Verify 385 permits load** in browser console

### Short-term Actions (Next 24 hours)
1. **Commit the fix** with proper testing
2. **Add database query error handling** to prevent silent failures
3. **Document database schema dependencies** for future refactoring

### Long-term Actions (Next Sprint)
1. **Database schema migration** if PERMIT2→PERMIT3 transition is truly needed
2. **Automated testing** for database query changes
3. **CI/CD checks** for database compatibility

## Conclusion

This is a classic case of a "working refactoring" that introduced database schema assumptions without validation. The commit successfully removed PERMIT2 references but added filters that reference non-existent columns, causing a complete failure of permit loading.

The fix is straightforward: remove the problematic database filters added in commit `92f7337` and test with the known working wallet address to verify 385 permits load correctly.

**Key Learning**: Always validate database schema compatibility when adding new query filters, especially after major refactoring commits.