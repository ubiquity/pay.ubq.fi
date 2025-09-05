# Permit Filtering Logic Flow - Complete Analysis

## Overview
This document traces the complete flow of how permits move through the system from database to UI display, identifying every filter, transformation, and potential failure point.

## Current Issue
**PROBLEM**: Fresh, legitimate permits are not appearing in the UI despite being present in the database.
**SYMPTOMS**: UI shows "0 rewards pending" even when database contains valid permits.

---

## Flow Diagram

```
[Database: 386 permits] 
    ↓
[Worker: fetchPermitsFromDb()] 
    ↓ 
[Worker: Basic validation - 50 filtered out]
    ↓
[Worker: 336 permits remaining]
    ↓
[Worker: validatePermitsBatch() - RPC validation]
    ↓
[Worker: Nonce deduplication - 9 marked as duplicates] 
    ↓
[Worker: 327 permits should remain valid]
    ↓
[Frontend: filterPermits() in use-permit-data.ts]
    ↓ 
[UI: Should display permits]
    ↓
[ACTUAL RESULT: 0 permits displayed] ❌
```

---

## Step-by-Step Analysis

### 1. Database Layer ✅ WORKING
**File**: Database queries  
**Function**: `fetchPermitsFromDb()`  
**Input**: Wallet address  
**Output**: 386 raw permits  
**Status**: ✅ CONFIRMED WORKING  

**What it does**:
- Queries permits table for beneficiary wallet
- Joins with token and partner data
- Returns raw permit objects

**Debug evidence**: 
```
Worker: Found 386 permits as beneficiary
```

### 2. Worker Basic Validation ✅ WORKING  
**File**: `permit-checker.worker.ts`  
**Lines**: ~300-400  
**Input**: 386 raw permits  
**Output**: 336 valid permits  
**Filtered out**: 50 permits (missing required fields)  
**Status**: ✅ CONFIRMED WORKING  

**What it does**:
- Filters out permits missing signature, amount, nonce, or token data
- Converts string amounts to BigInt
- Validates required fields exist

**Debug evidence**:
```
Worker: Total unique permits: 386
Worker: Filtered out 50 invalid permits from 386 total
```

### 3. Worker RPC Validation ⚠️ NEEDS INVESTIGATION
**File**: `permit-checker.worker.ts`  
**Function**: `validatePermitsBatch()`  
**Lines**: ~400-600  
**Input**: 336 permits  
**Output**: 336 permits with validation data  
**Status**: ⚠️ POTENTIAL ISSUE POINT  

**What it does**:
- Checks permits against blockchain via RPC
- Sets `isNonceUsed`, `checkError`, and other validation fields
- Groups permits into batches for RPC efficiency

**Potential Issues**:
- RPC errors could mark valid permits as invalid
- Network timeouts could cause false failures
- Batch processing errors could affect multiple permits

### 4. Worker Nonce Deduplication ✅ WORKING
**File**: `permit-checker.worker.ts`  
**Lines**: 634-692  
**Input**: 336 permits  
**Output**: 327 unique + 9 duplicates  
**Status**: ✅ CONFIRMED WORKING  

**What it does**:
- Groups permits by nonce value  
- Keeps highest amount permit per nonce
- Marks others as "permit with same nonce but higher amount exists"

**Debug evidence**:
```
Unique nonces: 327
Nonce 3743573319...: 2 permits (WILL DEDUPE)
  Selected passing permit: 0x57014581... (amount: 20708000000000000000)
  Keeping as winner: 0x57014581...
  Marking as duplicate: 0xf778cdc7...
```

### 5. Frontend Filtering 🔴 BROKEN - THIS IS THE ISSUE
**File**: `src/frontend/src/hooks/use-permit-data.ts`  
**Function**: `filterPermits()`  
**Lines**: 101-127  
**Input**: 327 permits (with 9 having duplicate errors)  
**Output**: ??? (likely 0 permits)  
**Status**: 🔴 BROKEN  

**What it does (CURRENT LOGIC)**:
```typescript
permitsMap.forEach((permit) => {
  // 1. Check for RPC errors
  if (permit.checkError) {
    const isRpcError = permit.checkError.toLowerCase().includes('rpc') || 
                      permit.checkError.toLowerCase().includes('network') ||
                      permit.checkError.toLowerCase().includes('batch request failed');
    
    if (isRpcError) {
      return; // Skip this permit ❌ FILTERS OUT
    }
  }
  
  // 2. Check definitive filters
  const definitelyUsed = permit.isNonceUsed === true;
  const definitelyClaimed = permit.status === "Claimed";  
  const hasNonceError = !!(permit.checkError && permit.checkError.toLowerCase().includes("nonce"));
  
  const shouldFilter = definitelyUsed || definitelyClaimed || hasNonceError;
  if (!shouldFilter) {
    filtered.push(permit); // Only add if NO filters match
  }
});
```

**THE CRITICAL BUG**: 
```typescript
const hasNonceError = !!(permit.checkError && permit.checkError.toLowerCase().includes("nonce"));
```

**This line filters out permits with ANY "nonce" error**, including:
- "permit with same nonce but higher amount exists" ✅ (should be filtered)  
- But also potentially other nonce-related errors that SHOULDN'T be filtered

---

## Debugging Strategy

### 1. Add Detailed Frontend Filtering Debug
**File**: `use-permit-data.ts`  
**Add after line 101**:
```typescript
console.log("=== FRONTEND FILTERING DEBUG ===");
console.log("Input permits:", permitsMap.size);

let rpcFiltered = 0;
let usedFiltered = 0; 
let claimedFiltered = 0;
let nonceFiltered = 0;
let passedThrough = 0;

permitsMap.forEach((permit) => {
  console.log(`\n--- Permit ${permit.signature?.substring(0, 10)}... ---`);
  console.log(`Amount: ${permit.amount}`);
  console.log(`Nonce: ${permit.nonce?.substring(0, 10)}...`);
  console.log(`Status: ${permit.status}`);
  console.log(`isNonceUsed: ${permit.isNonceUsed}`);
  console.log(`checkError: ${permit.checkError}`);
  
  // Check RPC errors
  if (permit.checkError) {
    const isRpcError = permit.checkError.toLowerCase().includes('rpc') || 
                      permit.checkError.toLowerCase().includes('network') ||
                      permit.checkError.toLowerCase().includes('batch request failed');
    
    if (isRpcError) {
      console.log("❌ FILTERED: RPC Error");
      rpcFiltered++;
      return;
    }
  }
  
  // Check filters
  const definitelyUsed = permit.isNonceUsed === true;
  const definitelyClaimed = permit.status === "Claimed";  
  const hasNonceError = !!(permit.checkError && permit.checkError.toLowerCase().includes("nonce"));
  
  console.log(`definitelyUsed: ${definitelyUsed}`);
  console.log(`definitelyClaimed: ${definitelyClaimed}`);
  console.log(`hasNonceError: ${hasNonceError}`);
  
  if (definitelyUsed) {
    console.log("❌ FILTERED: Nonce definitely used");
    usedFiltered++;
  } else if (definitelyClaimed) {
    console.log("❌ FILTERED: Already claimed");
    claimedFiltered++;
  } else if (hasNonceError) {
    console.log("❌ FILTERED: Has nonce error");
    nonceFiltered++;
  } else {
    console.log("✅ PASSED: Will display in UI");
    passedThrough++;
    filtered.push(permit);
  }
});

console.log("\n=== FRONTEND FILTERING SUMMARY ===");
console.log(`Input permits: ${permitsMap.size}`);
console.log(`RPC filtered: ${rpcFiltered}`);
console.log(`Used filtered: ${usedFiltered}`);
console.log(`Claimed filtered: ${claimedFiltered}`);
console.log(`Nonce error filtered: ${nonceFiltered}`);
console.log(`PASSED TO UI: ${passedThrough}`);
```

### 2. Investigate RPC Validation Issues
**The RPC validation step could be marking ALL permits as invalid**. Check for:

- **Network connectivity issues**
- **RPC endpoint failures** 
- **Batch request failures**
- **Gas estimation errors**
- **Invalid permit signatures** (from RPC perspective)

### 3. Check for Additional Hidden Filters
Look for other filtering logic in:
- Components that display permits
- Additional hooks or utilities
- Caching logic that might be stale

---

## Expected Behavior vs Actual

### For Your Fresh Permit
**Expected Flow**:
1. Database: ✅ Fresh permit exists  
2. Worker Basic: ✅ Should pass (has all required fields)
3. Worker RPC: ❓ Should validate against blockchain
4. Worker Nonce: ✅ Should pass (unique nonce)  
5. Frontend: ✅ Should pass (not used, not claimed, no nonce error)
6. UI: ✅ Should display

**Actual Flow**:
1. Database: ✅ Fresh permit exists
2. Worker Basic: ✅ Passes
3. Worker RPC: ❓ **LIKELY FAILURE POINT**
4. Worker Nonce: ✅ Would pass if RPC is good
5. Frontend: ❓ **DEFINITELY FILTERING SOMETHING OUT**
6. UI: ❌ Shows 0 permits

---

## Immediate Fix Strategy

### 1. Temporarily Bypass Frontend Filtering
**File**: `use-permit-data.ts`  
**Lines**: 101-127  

**Replace the entire filtering logic with**:
```typescript
// TEMPORARY: Show ALL permits to debug
console.log("BYPASS: Showing all permits for debugging");
permitsMap.forEach((permit) => {
  console.log(`Permit ${permit.signature?.substring(0, 10)}: ${permit.checkError || 'NO ERROR'}`);
  filtered.push(permit);
});
```

If permits show up after this, **the issue is in frontend filtering**.  
If permits still don't show up, **the issue is earlier in the pipeline**.

### 2. Fix the Nonce Error Filter
**The current logic is too broad**:
```typescript
// CURRENT (TOO BROAD)
const hasNonceError = !!(permit.checkError && permit.checkError.toLowerCase().includes("nonce"));

// FIXED (MORE SPECIFIC)  
const hasNonceError = permit.checkError === "permit with same nonce but higher amount exists";
```

Or better yet, be more specific about which nonce errors should filter:
```typescript
const shouldFilterForNonce = permit.checkError && (
  permit.checkError === "permit with same nonce but higher amount exists" ||
  permit.checkError.includes("nonce already used") ||
  permit.checkError.includes("invalid nonce")
);
```

---

## Root Cause Hypothesis

**Primary suspect**: RPC validation is failing for ALL permits due to:
1. Network/RPC issues  
2. Incorrect permit signature validation
3. Batch processing errors
4. Gas estimation failures

**Secondary suspect**: Frontend filtering is too aggressive and filtering out valid permits.

The debug output shows nonce deduplication working perfectly, so the issue is either in RPC validation or frontend filtering.

---

## Action Items

1. ✅ **Add comprehensive frontend filtering debug** (code provided above)
2. ⚠️ **Temporarily bypass frontend filtering** to isolate the issue  
3. ❓ **Investigate RPC validation step** for systematic failures
4. ❓ **Check for additional hidden filtering logic**
5. ❓ **Test with the fresh permit specifically** to trace its path

The key is to trace that fresh permit through each step and see exactly where it gets lost.