# Permits Not Showing - Detailed Analysis Report

## Executive Summary

The permits not showing issue appears to have been introduced during a major project refactoring that moved files from `frontend/` to `src/frontend/` structure. While the database layer is confirmed working (385 permits found), **all permits are being filtered out by a broken nonce deduplication logic** that marks every permit as a duplicate, even when they have unique nonces.

**Current Status**: 
- ✅ Database queries work (385 permits)
- ✅ Basic validation passes (335 permits)
- ❌ **BROKEN**: Nonce deduplication logic (marks all as duplicates)
- ❌ **BROKEN**: Frontend filtering (shows "0 rewards pending")

## Root Cause Analysis

### 1. **Project Refactoring Impact**

Based on `git diff 1c2e7aeadda2d488d96ed626e2fe6cde8abc5922`, the issue was introduced during a massive refactoring that:

- **File Structure Changes**: Moved `frontend/` → `src/frontend/`
- **Critical File Deletions**: Key files were deleted and recreated:
  - `frontend/src/workers/permit-checker.worker.ts` → `src/frontend/src/workers/permit-checker.worker.ts`
  - `frontend/src/hooks/use-permit-data.ts` → `src/frontend/src/hooks/use-permit-data.ts`  
  - `frontend/src/components/permits-table.tsx` → `src/frontend/src/components/permits-table.tsx`

- **Build Pipeline Changes**: Deployment paths updated
- **Configuration Changes**: Various config files modified

### 2. **The Core Issue: Nonce Deduplication Logic**

The primary issue is in the worker's nonce deduplication section (lines 634-662 in `permit-checker.worker.ts`):

**Console Evidence**:
```
Worker: Found 385 permits as beneficiary
Worker: Total unique permits: 385  
Worker: Filtered out 50 invalid permits from 385 total
[Permit 0xf778cdc7...] Validation error: permit with same nonce but higher amount exists
[Permit 0x3cf36613...] Validation error: permit with same nonce but higher amount exists
[...many more similar errors...]
```

**The Problem**: Every permit is getting marked with "permit with same nonce but higher amount exists" error, which is impossible if permits have unique nonces.

### 3. **Frontend Filtering Amplifies the Issue**

Even if nonce deduplication was working correctly, the frontend filtering in `use-permit-data.ts` (lines 117-121) is too aggressive:

```typescript
const definitelyUsed = permit.isNonceUsed === true;
const definitelyClaimed = permit.status === "Claimed"; 
const hasNonceError = !!(permit.checkError && permit.checkError.toLowerCase().includes("nonce"));
const shouldFilter = definitelyUsed || definitelyClaimed || hasNonceError;
```

The `hasNonceError` check catches "permit with same nonce but higher amount exists" errors and filters them out completely.

## Technical Deep Dive

### Database Layer ✅ (WORKING)

- **Direct Query Results**: 385 permits found for wallet `0x4007CE2083c7F3E18097aeB3A39bb8eC149a341d`
- **Relationships**: All foreign keys and joins work correctly
- **Data Integrity**: Permit ID 1846 confirmed present with correct:
  - Amount: `1260000000000000000`
  - Nonce: `37903025654497830078926798853589289520908972598977474259770938429919890846887`
  - Token/beneficiary relationships intact

### Worker Processing Layer ⚠️ (PARTIALLY WORKING)

- **Fetching**: Successfully retrieves 385 permits from database
- **Basic Validation**: Passes for 335 permits (filters out 50 with missing data)
- **RPC Communication**: Working correctly with proper responses
- **❌ Nonce Deduplication**: **BROKEN** - marking all permits as duplicates

### Frontend Layer ❌ (BROKEN)

- **Filtering Logic**: Too aggressive, filters out all permits with nonce errors
- **Cache Management**: Working correctly
- **UI Rendering**: Shows "0 rewards pending" because no permits pass filtering

## Suspected Code Issues

### 1. **Nonce Grouping Logic Bug**

The `permitsByNonce` Map creation or the deduplication selection logic is likely broken. Possible issues:

```typescript
// Line ~634 in permit-checker.worker.ts
// Suspected issue in this section:
for (const nonceGroup of permitsByNonce.values()) {
  if (nonceGroup.length > 1) {
    // Bug likely here - selecting wrong permit or marking all as duplicates
  }
}
```

### 2. **Permit Selection Algorithm**

The logic that selects which permit to keep from a nonce group may be:
- Always selecting the wrong permit
- Marking the selected permit incorrectly
- Not handling single-permit nonce groups properly

### 3. **State Management Issues**

During the refactoring, the permit state management between worker and frontend may have been broken:
- Worker returns permits with incorrect status
- Frontend filtering logic changed
- Cache invalidation timing issues

## Evidence Timeline

| Phase | Status | Evidence |
|-------|--------|----------|
| Database Fetch | ✅ WORKING | 385 permits retrieved |
| Worker Basic Validation | ✅ WORKING | 335 permits pass basic checks |
| Worker Nonce Deduplication | ❌ BROKEN | All permits marked as duplicates |
| Frontend Filtering | ❌ BROKEN | All permits filtered out |
| UI Display | ❌ BROKEN | Shows "0 rewards pending" |

## Impact Assessment

### User Impact
- **Complete Feature Failure**: No rewards are visible to users
- **Data Integrity**: Database contains valid permits but UI shows none
- **User Trust**: Multiple failed debugging attempts erode confidence

### Technical Debt
- **Refactoring Risks**: Major code restructuring without proper testing
- **Validation Logic**: Overly complex nonce deduplication needs simplification
- **Error Handling**: Poor error messages make debugging difficult

## Recommended Fix Strategy

### Phase 1: Immediate Bypass (Testing)
Temporarily disable nonce deduplication to confirm root cause:

```typescript
// In permit-checker.worker.ts, comment out lines 634-662
/*
// check duplicated permits by nonce  
for (const nonceGroup of permitsByNonce.values()) {
  // ... entire nonce deduplication logic
}
*/
```

### Phase 2: Fix Deduplication Logic
1. **Add Debug Logging**:
   ```typescript
   console.log("=== NONCE DEDUPLICATION DEBUG ===");
   console.log("Total permits before dedup:", finalPermits.length);
   console.log("Unique nonces:", permitsByNonce.size);
   ```

2. **Validate Grouping**: Ensure permits with unique nonces aren't grouped together
3. **Fix Selection Logic**: Ensure highest-value permit from each nonce group is selected correctly
4. **Handle Single Permits**: Don't mark single-permit nonce groups as duplicates

### Phase 3: Improve Frontend Filtering
Make frontend filtering less aggressive:
```typescript
// Only filter out definitively unusable permits
const shouldFilter = definitelyUsed || definitelyClaimed;
// Remove broad nonce error filtering
```

### Phase 4: Testing & Validation
1. Test with wallet `0x4007CE2083c7F3E18097aeB3A39bb8eC149a341d`
2. Verify permit ID 1846 appears in UI
3. Confirm "X rewards pending" instead of "0 rewards pending"

## Risk Assessment

### High Risk
- **Data Loss**: No immediate data loss risk (database intact)
- **User Experience**: Complete feature unavailability

### Medium Risk  
- **Development Time**: Complex debugging due to refactoring scope
- **Regression**: Other features may be affected by fixes

### Low Risk
- **Security**: No security implications identified
- **Performance**: No performance degradation from current broken state

## Success Criteria

1. **Permits Visible**: UI shows actual permit count instead of "0 rewards pending"
2. **Specific Test**: Permit ID 1846 appears in the UI for test wallet
3. **Console Clean**: No "same nonce but higher amount exists" errors for unique nonces
4. **Filter Logic**: Only definitively unusable permits are filtered out
5. **Performance**: No regression in loading times

## Files Requiring Immediate Attention

### Critical Files
1. `src/frontend/src/workers/permit-checker.worker.ts:634-662` - Nonce deduplication logic
2. `src/frontend/src/hooks/use-permit-data.ts:117-121` - Frontend filtering logic

### Supporting Files
3. `src/frontend/src/components/permits-table.tsx` - UI display logic
4. Database query functions in worker (already working)

## Lessons Learned

1. **Refactoring Without Tests**: Major structural changes without comprehensive testing caused critical failures
2. **Complex Validation Logic**: Overly sophisticated nonce deduplication is error-prone
3. **Aggressive Filtering**: Frontend filtering should be conservative, not aggressive
4. **Debug Tooling**: Need better logging and debug tools for Web Worker debugging

---

**Next Developer Action Required**: Implement Phase 1 bypass test to confirm this analysis, then proceed with systematic fixes.

**Estimated Fix Time**: 2-4 hours for complete resolution.