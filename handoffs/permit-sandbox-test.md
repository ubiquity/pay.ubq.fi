# Permit Sandbox Test - Handoff Document

## Objective
Create a standalone sandbox test that bypasses all UI components and directly tests the permit pipeline from database to final filtered results. Hard-code the user's wallet address and output the final permit list to prove the system works or identify the exact failure point.

## Problem Statement
- User created a fresh legitimate permit
- UI shows "0 rewards pending"
- Need to isolate if the issue is in data pipeline or UI rendering
- Stop fucking around with browser debugging - create a controlled test environment

## Requirements

### 1. Create Sandbox Test File
**Location**: `src/sandbox-permit-test.ts`

**Purpose**: 
- Hard-code wallet address: `0x4007CE2083c7F3E18097aeB3A39bb8eC149a341d`
- Run the EXACT same pipeline that the UI runs
- Output results at each step
- Prove permits exist and can be processed

### 2. Test Pipeline Steps

The sandbox should replicate this exact flow:

```
Database Query → Worker Basic Validation → RPC Validation → Nonce Deduplication → Frontend Filtering → RESULTS
```

### 3. Implementation Requirements

```typescript
// src/sandbox-permit-test.ts
import { /* database functions */ } from './backend/database-queries';
import { /* worker functions */ } from './frontend/src/workers/permit-checker.worker';

const WALLET_ADDRESS = "0x4007CE2083c7F3E18097aeB3A39bb8eC149a341d";

async function runPermitSandbox() {
  console.log("=== PERMIT SANDBOX TEST ===");
  console.log("Wallet:", WALLET_ADDRESS);
  
  // Step 1: Database Query
  console.log("\n1. DATABASE QUERY");
  const rawPermits = await fetchPermitsFromDatabase(WALLET_ADDRESS);
  console.log(`Raw permits from DB: ${rawPermits.length}`);
  if (rawPermits.length === 0) {
    console.error("❌ NO PERMITS IN DATABASE - Issue is data creation");
    return;
  }
  
  // Step 2: Worker Basic Validation
  console.log("\n2. WORKER BASIC VALIDATION");
  const basicValidated = runBasicValidation(rawPermits);
  console.log(`After basic validation: ${basicValidated.valid.length} valid, ${basicValidated.invalid.length} invalid`);
  if (basicValidated.valid.length === 0) {
    console.error("❌ ALL PERMITS FAILED BASIC VALIDATION");
    console.error("Invalid permits:", basicValidated.invalid.map(p => p.reason));
    return;
  }
  
  // Step 3: RPC Validation (the suspected failure point)
  console.log("\n3. RPC VALIDATION");
  try {
    const rpcValidated = await runRpcValidation(basicValidated.valid);
    console.log(`After RPC validation: ${rpcValidated.length} permits processed`);
    
    const withErrors = rpcValidated.filter(p => p.checkError);
    const withoutErrors = rpcValidated.filter(p => !p.checkError);
    
    console.log(`Permits WITH errors: ${withErrors.length}`);
    console.log(`Permits WITHOUT errors: ${withoutErrors.length}`);
    
    if (withoutErrors.length === 0) {
      console.error("❌ ALL PERMITS FAILED RPC VALIDATION");
      console.error("Sample errors:", withErrors.slice(0, 3).map(p => p.checkError));
      return;
    }
  } catch (error) {
    console.error("❌ RPC VALIDATION THREW EXCEPTION:", error);
    return;
  }
  
  // Step 4: Nonce Deduplication
  console.log("\n4. NONCE DEDUPLICATION");
  const afterDedup = runNonceDeduplication(rpcValidated);
  const duplicates = afterDedup.filter(p => p.checkError?.includes("same nonce"));
  const unique = afterDedup.filter(p => !p.checkError?.includes("same nonce"));
  console.log(`After deduplication: ${unique.length} unique, ${duplicates.length} duplicates`);
  
  // Step 5: Frontend Filtering
  console.log("\n5. FRONTEND FILTERING");
  const finalPermits = runFrontendFiltering(afterDedup);
  console.log(`Final permits for UI: ${finalPermits.length}`);
  
  // Step 6: Results
  console.log("\n=== FINAL RESULTS ===");
  if (finalPermits.length === 0) {
    console.error("❌ NO PERMITS SURVIVED THE PIPELINE");
    console.error("This proves the issue is in data processing, not UI rendering");
  } else {
    console.log(`✅ ${finalPermits.length} PERMITS READY FOR UI`);
    console.log("Sample permits:");
    finalPermits.slice(0, 3).forEach((permit, i) => {
      console.log(`  ${i + 1}. ${permit.signature?.substring(0, 10)}... Amount: ${permit.amount}`);
    });
    console.log("UI should show these permits - if it doesn't, the issue is in React rendering");
  }
}

// Run the test
runPermitSandbox().catch(console.error);
```

### 4. Extract Required Functions

The sandbox needs these functions extracted from existing code:

#### 4.1 Database Query Function
```typescript
async function fetchPermitsFromDatabase(walletAddress: string) {
  // Extract the exact database query from the worker
  // Should return raw permit objects from Supabase
}
```

#### 4.2 Basic Validation Function
```typescript
function runBasicValidation(rawPermits: any[]) {
  // Extract the basic validation logic
  // Filter out permits missing required fields
  // Return { valid: PermitData[], invalid: { permit: any, reason: string }[] }
}
```

#### 4.3 RPC Validation Function
```typescript
async function runRpcValidation(permits: PermitData[]) {
  // Extract the RPC validation logic from validatePermitsBatch
  // This is the suspected failure point
  // Should add checkError field to permits that fail validation
}
```

#### 4.4 Nonce Deduplication Function
```typescript
function runNonceDeduplication(permits: PermitData[]) {
  // Extract the nonce deduplication logic
  // Group by nonce, mark lower amounts as duplicates
}
```

#### 4.5 Frontend Filtering Function
```typescript
function runFrontendFiltering(permits: PermitData[]) {
  // Extract the frontend filtering logic from use-permit-data.ts
  // Filter out used, claimed, and errored permits
}
```

## Expected Outcomes

### Scenario 1: Database Issue
```
Raw permits from DB: 0
❌ NO PERMITS IN DATABASE - Issue is data creation
```
**Action**: Check database queries and permit creation process

### Scenario 2: Basic Validation Issue
```
Raw permits from DB: 386
After basic validation: 0 valid, 386 invalid
❌ ALL PERMITS FAILED BASIC VALIDATION
```
**Action**: Fix basic validation logic or data format issues

### Scenario 3: RPC Validation Issue (SUSPECTED)
```
Raw permits from DB: 386
After basic validation: 336 valid, 50 invalid
❌ ALL PERMITS FAILED RPC VALIDATION
```
**Action**: Fix RPC client, network issues, or validation logic

### Scenario 4: Data Pipeline Works, UI Broken
```
Raw permits from DB: 386
After basic validation: 336 valid, 50 invalid
After RPC validation: 327 permits processed
After deduplication: 318 unique, 9 duplicates
Final permits for UI: 318
✅ 318 PERMITS READY FOR UI
```
**Action**: Fix React rendering or component state issues

### Scenario 5: Everything Works
```
Final permits for UI: 318
✅ 318 PERMITS READY FOR UI
```
**Action**: The user is lying about the issue (unlikely but possible)

## Implementation Steps

1. **Create the sandbox file**: `src/sandbox-permit-test.ts`
2. **Extract all required functions** from existing codebase
3. **Run the test**: `bun run src/sandbox-permit-test.ts`
4. **Analyze results** and identify the exact failure point
5. **Fix the identified issue** instead of guessing

## Critical Requirements

- **Hard-code the wallet address** - no UI input needed
- **Use the EXACT same logic** as the real application
- **Output detailed logs** at each step
- **Stop at the first failure point** with clear error message
- **Prove the issue** with concrete evidence, not assumptions

## Success Criteria

After running the sandbox:
- We know EXACTLY which step is failing
- We have CONCRETE evidence of the issue
- We can fix the ROOT CAUSE instead of symptoms
- No more guessing or UI debugging bullshit

## Notes

- This sandbox replaces all the browser debugging nonsense
- It tests the actual data pipeline without React complications
- It provides definitive answers about where permits are lost
- It can be run repeatedly during development to verify fixes