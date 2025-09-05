import { describe, test, expect } from "bun:test";

// Mock PermitData interface
interface PermitData {
  id?: number;
  signature: string;
  amount: bigint;
  nonce: string;
  checkError?: string;
  status?: string;
  isNonceUsed?: boolean;
}

// Extract nonce deduplication logic from worker
function deduplicatePermitsByNonce(permits: PermitData[]): PermitData[] {
  const permitsByNonce = permits.reduce((map, p) => {
    const list = map.get(p.nonce) || [];
    list.push(p);
    map.set(p.nonce, list);
    return map;
  }, new Map<string, PermitData[]>());

  // Debug output for testing
  console.log("=== NONCE DEDUPLICATION DEBUG ===");
  console.log("Total permits before dedup:", permits.length);
  console.log("Unique nonces:", permitsByNonce.size);
  
  for (const [nonce, nonceGroup] of permitsByNonce.entries()) {
    if (nonceGroup.length > 1) {
      console.log(`Nonce ${nonce.substring(0, 10)}...: ${nonceGroup.length} permits (WILL DEDUPE)`);
      nonceGroup.forEach((p, i) => {
        console.log(`  ${i}: sig ${p.signature.substring(0, 10)}... amount: ${p.amount}`);
      });
    } else {
      console.log(`Nonce ${nonce.substring(0, 10)}...: ${nonceGroup.length} permit (unique)`);
    }
  }

  // Process deduplication
  for (const nonceGroup of permitsByNonce.values()) {
    // If there's only one permit in this nonce group, no need to dedupe
    if (nonceGroup.length <= 1) {
      continue;
    }
    
    const sortedByAmountDescending = nonceGroup.slice().sort((a, b) => {
      const diff = b.amount - a.amount;
      if (diff > 0n) return 1;
      if (diff < 0n) return -1;
      return 0;
    });
    
    // First try to find the highest amount permit without errors
    let passing = sortedByAmountDescending.find((p) => !p.checkError);
    
    // If all permits have errors, choose the highest amount one anyway
    if (!passing) {
      passing = sortedByAmountDescending[0];
    }
    
    // Mark all other permits in this nonce group as duplicates
    nonceGroup.forEach((p) => {
      if (p.signature !== passing.signature) {
        p.checkError = "permit with same nonce but higher amount exists";
      }
    });
  }

  return permits;
}

// Extract frontend filtering logic
function filterPermitsForDisplay(permits: PermitData[]): PermitData[] {
  const filtered: PermitData[] = [];
  
  permits.forEach((permit) => {
    // Check for RPC-related errors and log them for debugging
    if (permit.checkError) {
      console.error(`[Permit ${permit.signature?.substring(0, 10)}...] Validation error:`, permit.checkError);
      
      // If it's a serious RPC error that indicates the permit is unusable, filter it out
      const isRpcError = permit.checkError.toLowerCase().includes('rpc') || 
                        permit.checkError.toLowerCase().includes('network') ||
                        permit.checkError.toLowerCase().includes('batch request failed');
      
      if (isRpcError) {
        return; // Skip this permit due to RPC issues
      }
    }
    
    // Only filter out permits that are definitively claimed or used
    const definitelyUsed = permit.isNonceUsed === true;
    const definitelyClaimed = permit.status === "Claimed";
    const hasNonceError = !!(permit.checkError && permit.checkError.toLowerCase().includes("nonce"));
    
    const shouldFilter = definitelyUsed || definitelyClaimed || hasNonceError;
    if (!shouldFilter) {
      filtered.push(permit);
    }
  });

  return filtered;
}

describe("Permit Filtering Logic", () => {
  describe("Nonce Deduplication", () => {
    test("should not dedupe permits with unique nonces", () => {
      const permits: PermitData[] = [
        {
          signature: "0x1111111111",
          amount: 1000n,
          nonce: "nonce1"
        },
        {
          signature: "0x2222222222", 
          amount: 2000n,
          nonce: "nonce2"
        },
        {
          signature: "0x3333333333",
          amount: 1500n,
          nonce: "nonce3"
        }
      ];

      const result = deduplicatePermitsByNonce(permits);
      
      // None should have duplicate errors since all nonces are unique
      const duplicateErrors = result.filter(p => p.checkError?.includes("same nonce"));
      expect(duplicateErrors).toHaveLength(0);
      
      // All permits should be unchanged
      expect(result).toHaveLength(3);
    });

    test("should dedupe permits with identical nonces, keeping highest amount", () => {
      const permits: PermitData[] = [
        {
          signature: "0x1111111111",
          amount: 1000n,
          nonce: "same_nonce"
        },
        {
          signature: "0x2222222222",
          amount: 2000n,  // This should be kept (highest)
          nonce: "same_nonce"
        },
        {
          signature: "0x3333333333",
          amount: 1500n,
          nonce: "same_nonce"
        }
      ];

      const result = deduplicatePermitsByNonce(permits);
      
      // Two should be marked as duplicates
      const duplicateErrors = result.filter(p => p.checkError?.includes("same nonce"));
      expect(duplicateErrors).toHaveLength(2);
      
      // The highest amount one (2000n) should NOT have an error
      const passing = result.find(p => p.amount === 2000n);
      expect(passing?.checkError).toBeUndefined();
    });

    test("should handle mix of unique and duplicate nonces correctly", () => {
      const permits: PermitData[] = [
        {
          signature: "0x1111111111",
          amount: 1000n,
          nonce: "unique_nonce_1"
        },
        {
          signature: "0x2222222222",
          amount: 2000n,
          nonce: "duplicate_nonce"
        },
        {
          signature: "0x3333333333", 
          amount: 3000n, // Should be kept for duplicate_nonce
          nonce: "duplicate_nonce"
        },
        {
          signature: "0x4444444444",
          amount: 1500n,
          nonce: "unique_nonce_2"
        }
      ];

      const result = deduplicatePermitsByNonce(permits);
      
      // Only one should be marked as duplicate (the lower amount duplicate_nonce)
      const duplicateErrors = result.filter(p => p.checkError?.includes("same nonce"));
      expect(duplicateErrors).toHaveLength(1);
      expect(duplicateErrors[0].amount).toBe(2000n); // Lower amount should be marked
      
      // Unique nonces should be untouched
      const unique1 = result.find(p => p.nonce === "unique_nonce_1");
      const unique2 = result.find(p => p.nonce === "unique_nonce_2");
      expect(unique1?.checkError).toBeUndefined();
      expect(unique2?.checkError).toBeUndefined();
    });

    test("should handle permits with existing errors correctly", () => {
      const permits: PermitData[] = [
        {
          signature: "0x1111111111",
          amount: 1000n,
          nonce: "same_nonce",
          checkError: "some existing error"
        },
        {
          signature: "0x2222222222",
          amount: 2000n,  // Higher amount but has error
          nonce: "same_nonce",
          checkError: "another error"
        },
        {
          signature: "0x3333333333",
          amount: 1500n,  // Should be kept (no error)
          nonce: "same_nonce"
        }
      ];

      const result = deduplicatePermitsByNonce(permits);
      
      // The one without checkError should be kept
      const passing = result.find(p => p.amount === 1500n);
      expect(passing?.checkError).toBeUndefined();
      
      // The others should be marked as duplicates
      const duplicates = result.filter(p => p.checkError?.includes("same nonce"));
      expect(duplicates).toHaveLength(2);
    });
  });

  describe("Frontend Filtering", () => {
    test("should keep permits without any filtering conditions", () => {
      const permits: PermitData[] = [
        {
          signature: "0x1111111111",
          amount: 1000n,
          nonce: "nonce1"
        },
        {
          signature: "0x2222222222",
          amount: 2000n,
          nonce: "nonce2"
        }
      ];

      const result = filterPermitsForDisplay(permits);
      expect(result).toHaveLength(2);
    });

    test("should filter out permits that are definitely used", () => {
      const permits: PermitData[] = [
        {
          signature: "0x1111111111",
          amount: 1000n,
          nonce: "nonce1",
          isNonceUsed: true  // Should be filtered
        },
        {
          signature: "0x2222222222",
          amount: 2000n,
          nonce: "nonce2"
        }
      ];

      const result = filterPermitsForDisplay(permits);
      expect(result).toHaveLength(1);
      expect(result[0].signature).toBe("0x2222222222");
    });

    test("should filter out permits that are claimed", () => {
      const permits: PermitData[] = [
        {
          signature: "0x1111111111",
          amount: 1000n,
          nonce: "nonce1",
          status: "Claimed"  // Should be filtered
        },
        {
          signature: "0x2222222222",
          amount: 2000n,
          nonce: "nonce2"
        }
      ];

      const result = filterPermitsForDisplay(permits);
      expect(result).toHaveLength(1);
      expect(result[0].signature).toBe("0x2222222222");
    });

    test("should filter out permits with nonce errors", () => {
      const permits: PermitData[] = [
        {
          signature: "0x1111111111",
          amount: 1000n,
          nonce: "nonce1",
          checkError: "permit with same nonce but higher amount exists"  // Should be filtered
        },
        {
          signature: "0x2222222222",
          amount: 2000n,
          nonce: "nonce2"
        }
      ];

      const result = filterPermitsForDisplay(permits);
      expect(result).toHaveLength(1);
      expect(result[0].signature).toBe("0x2222222222");
    });

    test("should NOT filter permits with non-nonce errors", () => {
      const permits: PermitData[] = [
        {
          signature: "0x1111111111",
          amount: 1000n,
          nonce: "nonce1",
          checkError: "some other validation error"  // Should NOT be filtered
        },
        {
          signature: "0x2222222222",
          amount: 2000n,
          nonce: "nonce2"
        }
      ];

      const result = filterPermitsForDisplay(permits);
      expect(result).toHaveLength(2);
    });

    test("should filter out RPC errors", () => {
      const permits: PermitData[] = [
        {
          signature: "0x1111111111",
          amount: 1000n,
          nonce: "nonce1",
          checkError: "RPC error occurred"  // Should be filtered
        },
        {
          signature: "0x2222222222",
          amount: 2000n,
          nonce: "nonce2",
          checkError: "network timeout"  // Should be filtered
        },
        {
          signature: "0x3333333333",
          amount: 3000n,
          nonce: "nonce3",
          checkError: "batch request failed"  // Should be filtered
        },
        {
          signature: "0x4444444444",
          amount: 4000n,
          nonce: "nonce4"
        }
      ];

      const result = filterPermitsForDisplay(permits);
      expect(result).toHaveLength(1);
      expect(result[0].signature).toBe("0x4444444444");
    });
  });

  describe("Combined Pipeline", () => {
    test("should process the complete filtering pipeline correctly", () => {
      const permits: PermitData[] = [
        {
          signature: "0x1111111111",
          amount: 1000n,
          nonce: "same_nonce"
        },
        {
          signature: "0x2222222222", 
          amount: 2000n, // Higher amount, should win deduplication
          nonce: "same_nonce"
        },
        {
          signature: "0x3333333333",
          amount: 3000n,
          nonce: "unique_nonce",
          isNonceUsed: true // Should be filtered out at display level
        },
        {
          signature: "0x4444444444",
          amount: 4000n,
          nonce: "another_unique"
        }
      ];

      // Step 1: Dedupe by nonce 
      const afterDedup = deduplicatePermitsByNonce(permits);
      
      // Step 2: Filter for display
      const final = filterPermitsForDisplay(afterDedup);
      
      // Should only have 1 permit remaining:
      // - 0x1111111111 filtered as duplicate
      // - 0x2222222222 survives dedup
      // - 0x3333333333 filtered for being used
      // - 0x4444444444 survives everything
      expect(final).toHaveLength(2);
      expect(final.some(p => p.signature === "0x2222222222")).toBe(true);
      expect(final.some(p => p.signature === "0x4444444444")).toBe(true);
    });
  });
});