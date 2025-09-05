import { describe, test, expect } from "bun:test";

// Mock PermitData type based on real structure
interface PermitData {
  id?: number;
  signature?: string;
  amount: bigint | string;
  nonce: string;
  checkError?: string;
  status?: string;
  isNonceUsed?: boolean;
  token_id?: number;
  partner_id?: number;
  beneficiary_id?: number;
}

// Extract the EXACT filtering logic from use-permit-data.ts
function frontendFilterPermits(permitsMap: Map<string, PermitData>): PermitData[] {
  const filtered: PermitData[] = [];
  
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
    
    // Check for RPC-related errors and log them for debugging
    if (permit.checkError) {
      console.error(`[Permit ${permit.signature?.substring(0, 10)}...] Validation error:`, permit.checkError);
      
      // If it's a serious RPC error that indicates the permit is unusable, filter it out
      const isRpcError = permit.checkError.toLowerCase().includes('rpc') || 
                        permit.checkError.toLowerCase().includes('network') ||
                        permit.checkError.toLowerCase().includes('batch request failed');
      
      if (isRpcError) {
        console.log("❌ FILTERED: RPC Error");
        rpcFiltered++;
        return; // Skip this permit due to RPC issues
      }
    }
    
    // Only filter out permits that are definitively claimed or used
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
  
  return filtered;
}

describe("Frontend Filtering Logic Debug", () => {
  test("should test with realistic permit data that mimics what comes from worker", () => {
    const permits = new Map<string, PermitData>();
    
    // Test permits based on the actual debug output
    // 1. Fresh legitimate permit (should pass)
    permits.set("0x1111111111", {
      id: 1,
      signature: "0x1111111111111111111111111111111111111111111111111111111111111111",
      amount: "1260000000000000000",
      nonce: "12345678901234567890123456789012345678901234567890123456789012345678901234567",
      // No checkError, not used, not claimed - should pass
    });

    // 2. Valid permit with unique nonce (should pass)
    permits.set("0x2222222222", {
      id: 2, 
      signature: "0x2222222222222222222222222222222222222222222222222222222222222222",
      amount: "2500000000000000000",
      nonce: "98765432109876543210987654321098765432109876543210987654321098765432109876543",
      // No issues - should pass
    });

    // 3. Permit marked as duplicate (should be filtered)
    permits.set("0x3333333333", {
      id: 3,
      signature: "0x3333333333333333333333333333333333333333333333333333333333333333",
      amount: "1800000000000000000", 
      nonce: "11111111111111111111111111111111111111111111111111111111111111111111111111111",
      checkError: "permit with same nonce but higher amount exists"
      // Should be filtered due to nonce error
    });

    // 4. Permit with RPC error (should be filtered)
    permits.set("0x4444444444", {
      id: 4,
      signature: "0x4444444444444444444444444444444444444444444444444444444444444444",
      amount: "3000000000000000000",
      nonce: "22222222222222222222222222222222222222222222222222222222222222222222222222222",
      checkError: "RPC error: network timeout"
      // Should be filtered due to RPC error
    });

    // 5. Used permit (should be filtered)
    permits.set("0x5555555555", {
      id: 5,
      signature: "0x5555555555555555555555555555555555555555555555555555555555555555", 
      amount: "5000000000000000000",
      nonce: "33333333333333333333333333333333333333333333333333333333333333333333333333333",
      isNonceUsed: true
      // Should be filtered due to being used
    });

    // 6. Claimed permit (should be filtered)
    permits.set("0x6666666666", {
      id: 6,
      signature: "0x6666666666666666666666666666666666666666666666666666666666666666",
      amount: "1000000000000000000", 
      nonce: "44444444444444444444444444444444444444444444444444444444444444444444444444444",
      status: "Claimed"
      // Should be filtered due to being claimed
    });

    const result = frontendFilterPermits(permits);

    // Verify results
    console.log("\n=== TEST RESULTS ===");
    console.log(`Total permits tested: ${permits.size}`);
    console.log(`Permits passed filtering: ${result.length}`);
    console.log("Passed permit signatures:", result.map(p => p.signature?.substring(0, 10) + "..."));

    // Expectations:
    // - Fresh permit (0x1111111111) should pass ✅
    // - Valid unique permit (0x2222222222) should pass ✅  
    // - Duplicate permit (0x3333333333) should be filtered ❌
    // - RPC error permit (0x4444444444) should be filtered ❌
    // - Used permit (0x5555555555) should be filtered ❌
    // - Claimed permit (0x6666666666) should be filtered ❌
    // Expected: 2 permits should pass
    expect(result).toHaveLength(2);
    
    const passedSignatures = result.map(p => p.signature);
    expect(passedSignatures).toContain("0x1111111111111111111111111111111111111111111111111111111111111111");
    expect(passedSignatures).toContain("0x2222222222222222222222222222222222222222222222222222222222222222");
  });

  test("should test scenario where ALL permits are getting filtered incorrectly", () => {
    const permits = new Map<string, PermitData>();

    // Create 5 perfect permits that should ALL pass
    for (let i = 1; i <= 5; i++) {
      permits.set(`0x${i}${i}${i}${i}${i}${i}${i}${i}${i}${i}`, {
        id: i,
        signature: `0x${i}${i}${i}${i}${i}${i}${i}${i}${i}${i}${'1'.repeat(54)}`,
        amount: `${i}000000000000000000`,
        nonce: `${i}${'0'.repeat(76)}`,
        // No checkError, not used, not claimed - ALL should pass
      });
    }

    const result = frontendFilterPermits(permits);

    console.log("\n=== PERFECT PERMITS TEST ===");
    console.log(`Perfect permits input: ${permits.size}`);
    console.log(`Perfect permits output: ${result.length}`);

    // If this fails, the filtering logic is broken
    expect(result).toHaveLength(5);
  });

  test("should test with realistic data from debug output", () => {
    // Based on actual debug output showing 327 permits with 9 duplicates
    const permits = new Map<string, PermitData>();

    // Add 318 valid permits (simulate the ones with unique nonces)
    for (let i = 1; i <= 318; i++) {
      permits.set(`valid_${i}`, {
        id: i,
        signature: `0x${i.toString().padStart(64, '0')}`,
        amount: `${i * 1000000000000000000}`,
        nonce: `nonce_${i}_${'0'.repeat(70)}`,
        // Perfect permits - should all pass
      });
    }

    // Add 9 permits with duplicate nonce errors
    for (let i = 1; i <= 9; i++) {
      permits.set(`duplicate_${i}`, {
        id: 318 + i,
        signature: `0xdup${i.toString().padStart(60, '0')}`,
        amount: `${i * 500000000000000000}`,
        nonce: `shared_nonce_${i % 3}`,
        checkError: "permit with same nonce but higher amount exists"
      });
    }

    const result = frontendFilterPermits(permits);

    console.log("\n=== REALISTIC DATA TEST ===");
    console.log(`Input: 318 valid + 9 duplicates = ${permits.size} permits`);
    console.log(`Output: ${result.length} permits`);
    console.log(`Expected: 318 permits`);

    // This should pass 318 permits and filter 9 duplicates
    expect(result).toHaveLength(318);
  });

  test("should identify the specific filter that breaks everything", () => {
    const permits = new Map<string, PermitData>();

    // Single perfect permit
    permits.set("perfect", {
      id: 1,
      signature: "0x1234567890123456789012345678901234567890123456789012345678901234",
      amount: "1000000000000000000",
      nonce: "9999999999999999999999999999999999999999999999999999999999999999999999999999",
    });

    const result = frontendFilterPermits(permits);

    console.log("\n=== SINGLE PERFECT PERMIT TEST ===");
    console.log(`Single perfect permit result: ${result.length}`);

    if (result.length === 0) {
      console.error("🚨 CRITICAL: Even a perfect permit is being filtered!");
      console.error("The filtering logic has a fundamental bug.");
    } else {
      console.log("✅ Perfect permit passes - issue must be with permit data quality");
    }

    expect(result).toHaveLength(1);
  });

  test("should test different types of nonce errors", () => {
    const permits = new Map<string, PermitData>();

    // Test different nonce error messages
    const nonceErrors = [
      "permit with same nonce but higher amount exists", // From deduplication
      "nonce already used on chain", // Hypothetical
      "invalid nonce format", // Hypothetical  
      "RPC nonce validation failed", // Should be filtered as RPC error
      "network error checking nonce", // Should be filtered as RPC error
      "some other error with nonce mentioned", // Currently gets filtered
    ];

    nonceErrors.forEach((error, i) => {
      permits.set(`nonce_error_${i}`, {
        id: i + 1,
        signature: `0x${(i + 1).toString().padStart(64, '0')}`,
        amount: "1000000000000000000",
        nonce: `nonce_${i}_${'0'.repeat(70)}`,
        checkError: error
      });
    });

    const result = frontendFilterPermits(permits);

    console.log("\n=== NONCE ERROR TYPES TEST ===");
    console.log(`Different nonce errors tested: ${permits.size}`);
    console.log(`Permits that passed: ${result.length}`);

    // Based on current logic:
    // - "RPC nonce validation failed" should be filtered as RPC error
    // - "network error checking nonce" should be filtered as RPC error  
    // - All others should be filtered as nonce errors
    // Expected result: 0 permits pass (all have nonce errors)
    expect(result).toHaveLength(0);
  });
});