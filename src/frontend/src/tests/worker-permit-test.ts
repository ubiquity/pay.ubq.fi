import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database, Tables } from "../database.types";
import type { PermitData } from "../types";

// Test constants
const TEST_WALLET_ADDRESS = "0x4007CE2083c7F3E18097aeB3A39bb8eC149a341d";
const EXPECTED_PERMITS_COUNT = 385;

// Worker message types (copied from worker file)
type WorkerRequest =
  | { type: "INIT"; payload: { supabaseUrl: string; supabaseAnonKey: string; isDevelopment: boolean } }
  | { type: "FETCH_NEW_PERMITS"; payload: { address: `0x${string}`; lastCheckTimestamp?: string | null } };

type WorkerResponse =
  | { type: "INIT_SUCCESS" }
  | { type: "INIT_ERROR"; error: string }
  | { type: "NEW_PERMITS_VALIDATED"; permits: PermitData[]; balancesAndAllowances: Map<string, unknown> }
  | { type: "PERMITS_ERROR"; error: string };

interface TestResult {
  success: boolean;
  message: string;
  data?: unknown;
}

class WorkerPermitTester {
  private workerUrl: string;

  constructor() {
    // Path to the worker file
    this.workerUrl = new URL("../workers/permit-checker.worker.ts", import.meta.url).href;
  }

  /**
   * Test worker initialization
   */
  async testWorkerInit(supabaseUrl: string, supabaseKey: string): Promise<TestResult> {
    try {
      console.log("=== WORKER INITIALIZATION TEST ===");
      
      const worker = new Worker(this.workerUrl, { type: "module" });
      
      return new Promise((resolve) => {
        const timeout = setTimeout(() => {
          worker.terminate();
          resolve({
            success: false,
            message: "Worker initialization timed out after 5 seconds",
            data: null
          });
        }, 5000);

        worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
          clearTimeout(timeout);
          worker.terminate();
          
          const { type } = event.data;
          
          if (type === "INIT_SUCCESS") {
            resolve({
              success: true,
              message: "Worker initialized successfully",
              data: event.data
            });
          } else if (type === "INIT_ERROR") {
            resolve({
              success: false,
              message: `Worker initialization failed: ${(event.data as { error: string }).error}`,
              data: event.data
            });
          } else {
            resolve({
              success: false,
              message: `Unexpected response type: ${type}`,
              data: event.data
            });
          }
        };

        worker.onerror = (error) => {
          clearTimeout(timeout);
          worker.terminate();
          resolve({
            success: false,
            message: `Worker error: ${error.message}`,
            data: error
          });
        };

        // Send initialization message
        const initMessage: WorkerRequest = {
          type: "INIT",
          payload: {
            supabaseUrl,
            supabaseAnonKey: supabaseKey,
            isDevelopment: true
          }
        };
        
        worker.postMessage(initMessage);
      });
    } catch (error) {
      return {
        success: false,
        message: `Failed to create worker: ${error instanceof Error ? error.message : String(error)}`,
        data: error
      };
    }
  }

  /**
   * Test permit fetching through the worker
   */
  async testWorkerPermitFetching(
    supabaseUrl: string, 
    supabaseKey: string, 
    walletAddress: string = TEST_WALLET_ADDRESS
  ): Promise<TestResult> {
    try {
      console.log("=== WORKER PERMIT FETCHING TEST ===");
      console.log(`Testing wallet: ${walletAddress}`);
      
      const worker = new Worker(this.workerUrl, { type: "module" });
      
      return new Promise((resolve) => {
        const timeout = setTimeout(() => {
          worker.terminate();
          resolve({
            success: false,
            message: "Worker permit fetching timed out after 15 seconds",
            data: null
          });
        }, 15000);

        let initComplete = false;

        worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
          const { type } = event.data;
          
          console.log(`Worker message received: ${type}`);
          
          if (type === "INIT_SUCCESS") {
            initComplete = true;
            console.log("Worker initialized, now fetching permits...");
            
            // Send fetch permits message
            const fetchMessage: WorkerRequest = {
              type: "FETCH_NEW_PERMITS",
              payload: {
                address: walletAddress as `0x${string}`,
                lastCheckTimestamp: null // Fetch all permits
              }
            };
            
            worker.postMessage(fetchMessage);
          } else if (type === "INIT_ERROR") {
            clearTimeout(timeout);
            worker.terminate();
            resolve({
              success: false,
              message: `Worker initialization failed: ${(event.data as { error: string }).error}`,
              data: event.data
            });
          } else if (type === "NEW_PERMITS_VALIDATED") {
            clearTimeout(timeout);
            worker.terminate();
            
            const response = event.data as { permits: PermitData[]; balancesAndAllowances: Map<string, unknown> };
            const permitCount = response.permits.length;
            
            console.log(`Worker returned ${permitCount} permits`);
            
            if (permitCount === 0) {
              resolve({
                success: false,
                message: `Worker returned 0 permits, expected around ${EXPECTED_PERMITS_COUNT}. This indicates the database filtering issue from the diagnostic report.`,
                data: { permitCount, expected: EXPECTED_PERMITS_COUNT, permits: response.permits }
              });
            } else if (permitCount < EXPECTED_PERMITS_COUNT * 0.8) { // Allow some tolerance
              resolve({
                success: false,
                message: `Worker returned ${permitCount} permits, expected around ${EXPECTED_PERMITS_COUNT}. This may indicate incomplete permit fetching.`,
                data: { permitCount, expected: EXPECTED_PERMITS_COUNT, permits: response.permits.slice(0, 3) }
              });
            } else {
              // Test a few permits for validity
              const validPermits = response.permits.filter(p => 
                p.nonce && p.signature && p.owner && p.beneficiary && p.amount
              );
              
              resolve({
                success: true,
                message: `Worker successfully returned ${permitCount} permits (${validPermits.length} valid)`,
                data: { 
                  permitCount, 
                  validPermits: validPermits.length,
                  samplePermits: response.permits.slice(0, 3).map(p => ({
                    nonce: p.nonce,
                    amount: p.amount.toString(),
                    status: p.status,
                    checkError: p.checkError
                  }))
                }
              });
            }
          } else if (type === "PERMITS_ERROR") {
            clearTimeout(timeout);
            worker.terminate();
            resolve({
              success: false,
              message: `Worker permit fetching failed: ${(event.data as { error: string }).error}`,
              data: event.data
            });
          }
        };

        worker.onerror = (error) => {
          clearTimeout(timeout);
          worker.terminate();
          resolve({
            success: false,
            message: `Worker error: ${error.message}`,
            data: error
          });
        };

        // Send initialization message
        const initMessage: WorkerRequest = {
          type: "INIT",
          payload: {
            supabaseUrl,
            supabaseAnonKey: supabaseKey,
            isDevelopment: true
          }
        };
        
        worker.postMessage(initMessage);
      });
    } catch (error) {
      return {
        success: false,
        message: `Failed to test worker permit fetching: ${error instanceof Error ? error.message : String(error)}`,
        data: error
      };
    }
  }

  /**
   * Test worker behavior with different timestamps (incremental fetching)
   */
  async testIncrementalFetching(supabaseUrl: string, supabaseKey: string): Promise<TestResult> {
    try {
      console.log("=== WORKER INCREMENTAL FETCHING TEST ===");
      
      const worker = new Worker(this.workerUrl, { type: "module" });
      
      return new Promise((resolve) => {
        const timeout = setTimeout(() => {
          worker.terminate();
          resolve({
            success: false,
            message: "Worker incremental fetching timed out after 15 seconds",
            data: null
          });
        }, 15000);

        let initComplete = false;
        let firstFetchComplete = false;
        let firstFetchTimestamp: string;
        let firstPermitCount = 0;

        worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
          const { type } = event.data;
          
          if (type === "INIT_SUCCESS") {
            initComplete = true;
            console.log("Worker initialized, testing first fetch...");
            
            // First fetch - get all permits
            const fetchMessage: WorkerRequest = {
              type: "FETCH_NEW_PERMITS",
              payload: {
                address: TEST_WALLET_ADDRESS as `0x${string}`,
                lastCheckTimestamp: null
              }
            };
            
            worker.postMessage(fetchMessage);
          } else if (type === "NEW_PERMITS_VALIDATED") {
            const response = event.data as { permits: PermitData[]; balancesAndAllowances: Map<string, unknown> };
            
            if (!firstFetchComplete) {
              firstFetchComplete = true;
              firstPermitCount = response.permits.length;
              firstFetchTimestamp = new Date().toISOString();
              
              console.log(`First fetch returned ${firstPermitCount} permits`);
              
              // Wait a moment, then do an incremental fetch
              setTimeout(() => {
                console.log("Testing incremental fetch...");
                const incrementalFetchMessage: WorkerRequest = {
                  type: "FETCH_NEW_PERMITS",
                  payload: {
                    address: TEST_WALLET_ADDRESS as `0x${string}`,
                    lastCheckTimestamp: firstFetchTimestamp
                  }
                };
                
                worker.postMessage(incrementalFetchMessage);
              }, 1000);
            } else {
              // Second fetch (incremental)
              clearTimeout(timeout);
              worker.terminate();
              
              const secondPermitCount = response.permits.length;
              
              console.log(`Incremental fetch returned ${secondPermitCount} permits`);
              
              if (firstPermitCount === 0) {
                resolve({
                  success: false,
                  message: `First fetch returned 0 permits, indicating database filtering issues`,
                  data: { firstPermitCount, secondPermitCount }
                });
              } else {
                resolve({
                  success: true,
                  message: `Incremental fetching works correctly. Full: ${firstPermitCount}, incremental: ${secondPermitCount}`,
                  data: { firstPermitCount, secondPermitCount, firstFetchTimestamp }
                });
              }
            }
          } else if (type === "PERMITS_ERROR") {
            clearTimeout(timeout);
            worker.terminate();
            resolve({
              success: false,
              message: `Worker incremental fetching failed: ${(event.data as { error: string }).error}`,
              data: event.data
            });
          } else if (type === "INIT_ERROR") {
            clearTimeout(timeout);
            worker.terminate();
            resolve({
              success: false,
              message: `Worker initialization failed: ${(event.data as { error: string }).error}`,
              data: event.data
            });
          }
        };

        worker.onerror = (error) => {
          clearTimeout(timeout);
          worker.terminate();
          resolve({
            success: false,
            message: `Worker error: ${error.message}`,
            data: error
          });
        };

        // Send initialization message
        const initMessage: WorkerRequest = {
          type: "INIT",
          payload: {
            supabaseUrl,
            supabaseAnonKey: supabaseKey,
            isDevelopment: true
          }
        };
        
        worker.postMessage(initMessage);
      });
    } catch (error) {
      return {
        success: false,
        message: `Failed to test incremental fetching: ${error instanceof Error ? error.message : String(error)}`,
        data: error
      };
    }
  }

  /**
   * Run all worker tests
   */
  async runAllTests(): Promise<void> {
    console.log("🔧 Starting Worker Permit Tests");
    console.log("===============================");

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseKey) {
      console.error("❌ Missing environment variables:");
      console.error("   SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
      return;
    }

    const tests = [
      { name: "Worker Initialization", test: () => this.testWorkerInit(supabaseUrl, supabaseKey) },
      { name: "Worker Permit Fetching", test: () => this.testWorkerPermitFetching(supabaseUrl, supabaseKey) },
      { name: "Incremental Permit Fetching", test: () => this.testIncrementalFetching(supabaseUrl, supabaseKey) },
    ];

    let passed = 0;
    let failed = 0;

    for (const testCase of tests) {
      console.log(`\n🔍 Running: ${testCase.name}`);
      console.log("-".repeat(40));
      
      try {
        const result = await testCase.test();
        
        if (result.success) {
          console.log(`✅ PASS: ${result.message}`);
          if (result.data) {
            console.log("   Details:", JSON.stringify(result.data, null, 2));
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

    console.log("\n" + "=".repeat(40));
    console.log(`📊 Test Summary: ${passed} passed, ${failed} failed`);
    
    if (failed === 0) {
      console.log("🎉 All worker tests passed! The worker should be functioning correctly.");
    } else {
      console.log(`⚠️  ${failed} test(s) failed. This may indicate the database filtering issue is still present.`);
    }
  }
}

// Export for use in other files
export { WorkerPermitTester };

// Run tests if this file is executed directly
if (require.main === module || (typeof process !== "undefined" && process.argv[1] === import.meta.url)) {
  const tester = new WorkerPermitTester();
  await tester.runAllTests();
}