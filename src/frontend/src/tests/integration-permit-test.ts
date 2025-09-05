import type { Address } from "viem";
import type { AllowanceAndBalance, PermitData } from "../types";

// Test constants
const TEST_WALLET_ADDRESS = "0x4007CE2083c7F3E18097aeB3A39bb8eC149a341d" as Address;
const EXPECTED_PERMITS_COUNT = 385;

interface TestResult {
  success: boolean;
  message: string;
  data?: unknown;
}

/**
 * Integration test that simulates the complete permit flow:
 * Frontend → Worker → Database → Validation → UI Display
 */
class IntegrationPermitTester {
  private supabaseUrl: string;
  private supabaseKey: string;

  constructor(supabaseUrl: string, supabaseKey: string) {
    this.supabaseUrl = supabaseUrl;
    this.supabaseKey = supabaseKey;
  }

  /**
   * Test the complete permit data flow using the usePermitData hook logic
   */
  async testCompletePermitFlow(): Promise<TestResult> {
    try {
      console.log("=== INTEGRATION TEST: COMPLETE PERMIT FLOW ===");
      console.log(`Testing with wallet: ${TEST_WALLET_ADDRESS}`);

      // Step 1: Create and initialize worker (simulating usePermitData hook)
      const workerUrl = new URL("../workers/permit-checker.worker.ts", import.meta.url).href;
      const worker = new Worker(workerUrl, { type: "module" });

      return new Promise((resolve) => {
        const timeout = setTimeout(() => {
          worker.terminate();
          resolve({
            success: false,
            message: "Integration test timed out after 30 seconds",
            data: null
          });
        }, 30000);

        let workerInitialized = false;
        let permitsFetched = false;
        const flowResults: {
          workerInit: boolean;
          permitCount: number;
          validPermits: number;
          balanceAllowanceCount: number;
          samplePermits: unknown[];
          flowTime: number;
        } = {
          workerInit: false,
          permitCount: 0,
          validPermits: 0,
          balanceAllowanceCount: 0,
          samplePermits: [],
          flowTime: 0
        };

        const startTime = Date.now();

        worker.onmessage = (event) => {
          const { type, permits, balancesAndAllowances, error } = event.data;
          
          console.log(`Integration test: Worker message received: ${type}`);

          if (type === "INIT_SUCCESS") {
            workerInitialized = true;
            flowResults.workerInit = true;
            
            console.log("Integration test: Worker initialized, fetching permits...");
            
            // Step 2: Fetch permits (simulating the hook behavior)
            worker.postMessage({
              type: "FETCH_NEW_PERMITS",
              payload: {
                address: TEST_WALLET_ADDRESS,
                lastCheckTimestamp: null // Fetch all permits like initial load
              }
            });
            
          } else if (type === "NEW_PERMITS_VALIDATED") {
            permitsFetched = true;
            flowResults.flowTime = Date.now() - startTime;
            
            const permitList = permits as PermitData[];
            const balanceMap = balancesAndAllowances as Map<string, AllowanceAndBalance>;
            
            flowResults.permitCount = permitList.length;
            flowResults.balanceAllowanceCount = balanceMap?.size || 0;
            
            // Step 3: Analyze permit quality (simulating frontend filtering)
            const validPermits = permitList.filter(p => 
              p.nonce && 
              p.signature && 
              p.owner && 
              p.beneficiary && 
              p.amount &&
              !p.checkError
            );
            
            const claimablePermits = permitList.filter(p => 
              p.status === "Valid" && 
              !p.checkError &&
              p.beneficiary?.toLowerCase() === TEST_WALLET_ADDRESS.toLowerCase()
            );
            
            const expiredPermits = permitList.filter(p => p.status === "Expired");
            const errorPermits = permitList.filter(p => p.checkError);
            
            flowResults.validPermits = validPermits.length;
            flowResults.samplePermits = permitList.slice(0, 3).map(p => ({
              nonce: p.nonce,
              amount: p.amount.toString(),
              status: p.status,
              checkError: p.checkError,
              beneficiary: p.beneficiary,
              owner: p.owner
            }));

            clearTimeout(timeout);
            worker.terminate();

            console.log("=== INTEGRATION TEST RESULTS ===");
            console.log(`Total permits: ${flowResults.permitCount}`);
            console.log(`Valid permits: ${flowResults.validPermits}`);
            console.log(`Claimable permits: ${claimablePermits.length}`);
            console.log(`Expired permits: ${expiredPermits.length}`);
            console.log(`Error permits: ${errorPermits.length}`);
            console.log(`Balance/allowance entries: ${flowResults.balanceAllowanceCount}`);
            console.log(`Flow completed in: ${flowResults.flowTime}ms`);

            // Determine test success based on diagnostic report expectations
            if (flowResults.permitCount === 0) {
              resolve({
                success: false,
                message: `CRITICAL: No permits returned. This confirms the database filtering issue described in the diagnostic report.`,
                data: {
                  ...flowResults,
                  analysis: {
                    issue: "DATABASE_QUERY_RETURNS_ZERO",
                    expectedPermits: EXPECTED_PERMITS_COUNT,
                    actualPermits: flowResults.permitCount,
                    recommendation: "Check database query filters in permit-checker.worker.ts lines 225-247"
                  }
                }
              });
            } else if (flowResults.permitCount < EXPECTED_PERMITS_COUNT * 0.5) {
              resolve({
                success: false,
                message: `PARTIAL FAILURE: Found ${flowResults.permitCount} permits but expected around ${EXPECTED_PERMITS_COUNT}. Database filters may be too restrictive.`,
                data: {
                  ...flowResults,
                  analysis: {
                    issue: "PARTIAL_PERMIT_RETRIEVAL",
                    expectedPermits: EXPECTED_PERMITS_COUNT,
                    actualPermits: flowResults.permitCount,
                    percentage: Math.round((flowResults.permitCount / EXPECTED_PERMITS_COUNT) * 100)
                  }
                }
              });
            } else {
              resolve({
                success: true,
                message: `Integration test PASSED: Retrieved ${flowResults.permitCount} permits (${flowResults.validPermits} valid, ${claimablePermits.length} claimable)`,
                data: {
                  ...flowResults,
                  analysis: {
                    claimablePermits: claimablePermits.length,
                    expiredPermits: expiredPermits.length,
                    errorPermits: errorPermits.length,
                    healthScore: Math.round((validPermits.length / flowResults.permitCount) * 100)
                  }
                }
              });
            }

          } else if (type === "PERMITS_ERROR") {
            clearTimeout(timeout);
            worker.terminate();
            resolve({
              success: false,
              message: `Worker error during permit fetching: ${error}`,
              data: { error, flowTime: Date.now() - startTime }
            });

          } else if (type === "INIT_ERROR") {
            clearTimeout(timeout);
            worker.terminate();
            resolve({
              success: false,
              message: `Worker initialization failed: ${error}`,
              data: { error }
            });
          }
        };

        worker.onerror = (error) => {
          clearTimeout(timeout);
          worker.terminate();
          resolve({
            success: false,
            message: `Worker error: ${error.message}`,
            data: { error }
          });
        };

        // Step 1: Initialize worker
        console.log("Integration test: Initializing worker...");
        worker.postMessage({
          type: "INIT",
          payload: {
            supabaseUrl: this.supabaseUrl,
            supabaseAnonKey: this.supabaseKey,
            isDevelopment: true
          }
        });
      });

    } catch (error) {
      return {
        success: false,
        message: `Integration test setup failed: ${error instanceof Error ? error.message : String(error)}`,
        data: error
      };
    }
  }

  /**
   * Test caching behavior (simulating localStorage interactions)
   */
  async testPermitCaching(): Promise<TestResult> {
    try {
      console.log("=== INTEGRATION TEST: PERMIT CACHING ===");

      // Simulate the caching logic from usePermitData
      const CACHE_KEY = "permitDataCache";
      const testPermit: PermitData = {
        permit2Address: "0x000000000022D473030F116dDEE9F6B43aC78BA3",
        nonce: "123456",
        networkId: 100,
        beneficiary: TEST_WALLET_ADDRESS,
        deadline: String(Math.floor(Date.now() / 1000) + 86400),
        signature: "0xtest-signature",
        type: "erc20-permit",
        owner: "0xowner-address",
        tokenAddress: "0xtoken-address",
        token: { address: "0xtoken-address", network: 100 },
        amount: BigInt("1000000000000000000"),
        claimStatus: "Idle",
        status: "Valid"
      };

      // Test cache save
      const cacheData = { [testPermit.nonce]: testPermit };
      
      try {
        localStorage.setItem(CACHE_KEY, JSON.stringify(cacheData, (key, value) => {
          // Handle BigInt serialization
          return typeof value === 'bigint' ? value.toString() : value;
        }));
      } catch (error) {
        return {
          success: false,
          message: `Failed to save cache: ${error instanceof Error ? error.message : String(error)}`,
          data: error
        };
      }

      // Test cache retrieve
      let retrievedCache;
      try {
        const cached = localStorage.getItem(CACHE_KEY);
        if (cached) {
          retrievedCache = JSON.parse(cached);
          // Restore BigInt values
          Object.values(retrievedCache).forEach((permit: any) => {
            if (permit.amount && typeof permit.amount === 'string') {
              permit.amount = BigInt(permit.amount);
            }
          });
        }
      } catch (error) {
        return {
          success: false,
          message: `Failed to retrieve cache: ${error instanceof Error ? error.message : String(error)}`,
          data: error
        };
      }

      // Verify cache integrity
      if (!retrievedCache || !retrievedCache[testPermit.nonce]) {
        return {
          success: false,
          message: "Cache data was not properly stored or retrieved",
          data: { saved: cacheData, retrieved: retrievedCache }
        };
      }

      const retrievedPermit = retrievedCache[testPermit.nonce];
      if (retrievedPermit.amount.toString() !== testPermit.amount.toString()) {
        return {
          success: false,
          message: "BigInt amount was not properly preserved in cache",
          data: { 
            original: testPermit.amount.toString(), 
            retrieved: retrievedPermit.amount.toString() 
          }
        };
      }

      // Clean up
      localStorage.removeItem(CACHE_KEY);

      return {
        success: true,
        message: "Permit caching works correctly with BigInt serialization",
        data: { testPermit: retrievedPermit }
      };

    } catch (error) {
      return {
        success: false,
        message: `Cache test failed: ${error instanceof Error ? error.message : String(error)}`,
        data: error
      };
    }
  }

  /**
   * Test error handling scenarios
   */
  async testErrorHandling(): Promise<TestResult> {
    try {
      console.log("=== INTEGRATION TEST: ERROR HANDLING ===");

      // Test 1: Invalid Supabase URL
      const workerUrl = new URL("../workers/permit-checker.worker.ts", import.meta.url).href;
      const worker = new Worker(workerUrl, { type: "module" });

      return new Promise((resolve) => {
        const timeout = setTimeout(() => {
          worker.terminate();
          resolve({
            success: false,
            message: "Error handling test timed out",
            data: null
          });
        }, 10000);

        worker.onmessage = (event) => {
          const { type, error } = event.data;
          
          if (type === "INIT_ERROR") {
            clearTimeout(timeout);
            worker.terminate();
            
            if (error && error.includes("supabaseUrl")) {
              resolve({
                success: true,
                message: "Error handling works correctly - invalid Supabase URL properly rejected",
                data: { error }
              });
            } else {
              resolve({
                success: false,
                message: `Unexpected error format: ${error}`,
                data: { error }
              });
            }
          } else if (type === "INIT_SUCCESS") {
            clearTimeout(timeout);
            worker.terminate();
            resolve({
              success: false,
              message: "Worker should have failed with invalid Supabase URL",
              data: null
            });
          }
        };

        worker.onerror = () => {
          clearTimeout(timeout);
          worker.terminate();
          resolve({
            success: true,
            message: "Worker correctly threw error with invalid configuration",
            data: null
          });
        };

        // Send invalid configuration
        worker.postMessage({
          type: "INIT",
          payload: {
            supabaseUrl: "invalid-url",
            supabaseAnonKey: "invalid-key",
            isDevelopment: true
          }
        });
      });

    } catch (error) {
      return {
        success: false,
        message: `Error handling test setup failed: ${error instanceof Error ? error.message : String(error)}`,
        data: error
      };
    }
  }

  /**
   * Run all integration tests
   */
  async runAllTests(): Promise<void> {
    console.log("🔄 Starting Integration Permit Tests");
    console.log("====================================");

    const tests = [
      { name: "Complete Permit Flow", test: () => this.testCompletePermitFlow() },
      { name: "Permit Caching", test: () => this.testPermitCaching() },
      { name: "Error Handling", test: () => this.testErrorHandling() },
    ];

    let passed = 0;
    let failed = 0;

    for (const testCase of tests) {
      console.log(`\n🔍 Running: ${testCase.name}`);
      console.log("-".repeat(50));
      
      try {
        const result = await testCase.test();
        
        if (result.success) {
          console.log(`✅ PASS: ${result.message}`);
          if (result.data) {
            console.log("   Results:", JSON.stringify(result.data, null, 2));
          }
          passed++;
        } else {
          console.log(`❌ FAIL: ${result.message}`);
          if (result.data) {
            console.log("   Data:", JSON.stringify(result.data, null, 2));
          }
          failed++;
        }
      } catch (error) {
        console.log(`❌ ERROR: ${testCase.name} threw an exception`);
        console.log(`   ${error instanceof Error ? error.message : String(error)}`);
        failed++;
      }
    }

    console.log("\n" + "=".repeat(50));
    console.log(`📊 Integration Test Summary: ${passed} passed, ${failed} failed`);
    
    if (failed === 0) {
      console.log("🎉 All integration tests passed!");
      console.log("   The complete permit flow is working correctly.");
    } else {
      console.log(`⚠️  ${failed} integration test(s) failed.`);
      console.log("   This indicates issues in the end-to-end permit processing flow.");
      
      if (failed === 1 && passed >= 2) {
        console.log("   Most functionality works, but there may be edge case issues.");
      } else {
        console.log("   Critical issues detected - check diagnostic report recommendations.");
      }
    }
  }
}

// Export for use in other files
export { IntegrationPermitTester };

// Run tests if this file is executed directly
if (require.main === module || (typeof process !== "undefined" && process.argv[1] === import.meta.url)) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error("❌ Missing environment variables:");
    console.error("   SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
    console.error("   Make sure your .env file is properly configured");
    process.exit(1);
  }

  const tester = new IntegrationPermitTester(supabaseUrl, supabaseKey);
  await tester.runAllTests();
}