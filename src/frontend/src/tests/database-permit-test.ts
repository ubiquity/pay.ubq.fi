import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database, Tables } from "../database.types";

// Constants matching the worker
const PERMITS_TABLE = "permits";
const WALLETS_TABLE = "wallets";
const TOKENS_TABLE = "tokens";
const PARTNERS_TABLE = "partners";
const LOCATIONS_TABLE = "locations";

// Test wallet address from diagnostic report
const TEST_WALLET_ADDRESS = "0x4007CE2083c7F3E18097aeB3A39bb8eC149a341d";
const EXPECTED_PERMITS_COUNT = 385;

type PermitRow = Tables<"permits"> & {
  token: Tables<"tokens"> | null;
  partner: (Tables<"partners"> & { wallet: Tables<"wallets"> | null }) | null;
  location: Tables<"locations"> | null;
};

interface TestResult {
  success: boolean;
  message: string;
  data?: unknown;
}

class DatabasePermitTester {
  private supabase: SupabaseClient<Database>;

  constructor(supabaseUrl: string, supabaseKey: string) {
    this.supabase = createClient<Database>(supabaseUrl, supabaseKey);
  }

  /**
   * Test direct database queries to verify permits exist
   * This replicates the exact queries from fetchPermitsFromDb()
   */
  async testPermitFetching(walletAddress: string = TEST_WALLET_ADDRESS): Promise<TestResult> {
    try {
      console.log("=== DATABASE PERMIT FETCHING TEST ===");
      console.log(`Testing wallet: ${walletAddress}`);
      
      const normalizedWalletAddress = walletAddress.toLowerCase();

      // Query for permits where user can claim (beneficiary) - exact replica from worker
      const beneficiaryJoinQuery = `
        *,
        token:${TOKENS_TABLE}(address, network),
        partner:${PARTNERS_TABLE}(wallet:${WALLETS_TABLE}(address)),
        location:${LOCATIONS_TABLE}(node_url),
        users!inner(
          wallets!inner(address)
        )
      `;

      const beneficiaryQuery = this.supabase
        .from(PERMITS_TABLE)
        .select(beneficiaryJoinQuery)
        .is("transaction", null)
        .filter("users.wallets.address", "ilike", normalizedWalletAddress);

      // Query for permits where user is the owner (funding wallet)
      const ownerJoinQuery = `
        *,
        token:${TOKENS_TABLE}(address, network),
        partner:${PARTNERS_TABLE}!inner(wallet:${WALLETS_TABLE}!inner(address)),
        location:${LOCATIONS_TABLE}(node_url),
        users(
          wallets(address)
        )
      `;

      const ownerQuery = this.supabase
        .from(PERMITS_TABLE)
        .select(ownerJoinQuery)
        .is("transaction", null)
        .filter("partner.wallet.address", "ilike", normalizedWalletAddress);

      // Execute both queries
      const [beneficiaryResult, ownerResult] = await Promise.all([beneficiaryQuery, ownerQuery]);

      console.log("Beneficiary query result:", {
        error: beneficiaryResult.error?.message || null,
        dataLength: beneficiaryResult.data?.length || 0
      });

      console.log("Owner query result:", {
        error: ownerResult.error?.message || null,
        dataLength: ownerResult.data?.length || 0
      });

      // Check for errors
      if (beneficiaryResult.error) {
        return {
          success: false,
          message: `Beneficiary query failed: ${beneficiaryResult.error.message}`,
          data: beneficiaryResult.error
        };
      }

      if (ownerResult.error) {
        return {
          success: false,
          message: `Owner query failed: ${ownerResult.error.message}`,
          data: ownerResult.error
        };
      }

      // Combine results and remove duplicates (same logic as worker)
      const permitMap = new Map<number, unknown>();

      if (beneficiaryResult.data && beneficiaryResult.data.length > 0) {
        beneficiaryResult.data.forEach((permit) => {
          permitMap.set(permit.id, permit);
        });
      }

      if (ownerResult.data && ownerResult.data.length > 0) {
        ownerResult.data.forEach((permit) => {
          permitMap.set(permit.id, permit);
        });
      }

      const totalPermits = permitMap.size;
      const beneficiaryCount = beneficiaryResult.data?.length || 0;
      const ownerCount = ownerResult.data?.length || 0;

      console.log(`Total unique permits: ${totalPermits}`);
      console.log(`Beneficiary permits: ${beneficiaryCount}`);
      console.log(`Owner permits: ${ownerCount}`);

      if (totalPermits === 0) {
        return {
          success: false,
          message: `No permits found for wallet ${walletAddress}. Expected ${EXPECTED_PERMITS_COUNT} permits.`,
          data: { totalPermits, beneficiaryCount, ownerCount }
        };
      }

      if (totalPermits < EXPECTED_PERMITS_COUNT) {
        return {
          success: false,
          message: `Found ${totalPermits} permits, expected ${EXPECTED_PERMITS_COUNT}. This suggests the database filtering issue may still exist.`,
          data: { totalPermits, beneficiaryCount, ownerCount, expected: EXPECTED_PERMITS_COUNT }
        };
      }

      return {
        success: true,
        message: `Successfully found ${totalPermits} permits (${beneficiaryCount} as beneficiary, ${ownerCount} as owner)`,
        data: { totalPermits, beneficiaryCount, ownerCount }
      };

    } catch (error) {
      return {
        success: false,
        message: `Database test failed: ${error instanceof Error ? error.message : String(error)}`,
        data: error
      };
    }
  }

  /**
   * Test for the specific problematic filters mentioned in the diagnostic report
   */
  async testProblematicFilters(): Promise<TestResult> {
    try {
      console.log("=== TESTING PROBLEMATIC FILTERS ===");
      
      // Test the filters that were causing the issue
      const problematicQuery = this.supabase
        .from(PERMITS_TABLE)
        .select("*")
        .is("transaction", null);

      // Try to add the problematic filters that were mentioned in the report
      try {
        const withProblematicFilters = problematicQuery
          .eq("permit2_address", "0x000000000022D473030F116dDEE9F6B43aC78BA3") // PERMIT3 address
          .filter("token.network", "eq", 100); // Gnosis Chain filter

        const result = await withProblematicFilters;
        
        if (result.error) {
          return {
            success: true, // This is expected - the filters should fail
            message: `Problematic filters correctly failed: ${result.error.message}`,
            data: result.error
          };
        } else {
          return {
            success: false,
            message: `Problematic filters unexpectedly worked, returned ${result.data?.length || 0} permits`,
            data: result.data
          };
        }
      } catch (error) {
        return {
          success: true, // This is expected - the filters should cause an error
          message: `Problematic filters correctly threw error: ${error instanceof Error ? error.message : String(error)}`,
          data: error
        };
      }

    } catch (error) {
      return {
        success: false,
        message: `Error testing problematic filters: ${error instanceof Error ? error.message : String(error)}`,
        data: error
      };
    }
  }

  /**
   * Test database schema to check if problematic columns exist
   */
  async testDatabaseSchema(): Promise<TestResult> {
    try {
      console.log("=== TESTING DATABASE SCHEMA ===");
      
      // Get a sample permit to check available columns
      const sampleQuery = await this.supabase
        .from(PERMITS_TABLE)
        .select("*")
        .limit(1);

      if (sampleQuery.error) {
        return {
          success: false,
          message: `Failed to fetch sample permit: ${sampleQuery.error.message}`,
          data: sampleQuery.error
        };
      }

      if (!sampleQuery.data || sampleQuery.data.length === 0) {
        return {
          success: false,
          message: "No permits found in database to check schema",
          data: null
        };
      }

      const samplePermit = sampleQuery.data[0];
      const availableColumns = Object.keys(samplePermit);
      
      console.log("Available columns in permits table:", availableColumns);
      
      const hasPermit2Address = availableColumns.includes("permit2_address");
      
      return {
        success: true,
        message: `Schema check complete. permit2_address column exists: ${hasPermit2Address}`,
        data: { 
          availableColumns, 
          hasPermit2Address,
          samplePermit: {
            id: samplePermit.id,
            nonce: samplePermit.nonce,
            created: samplePermit.created
          }
        }
      };

    } catch (error) {
      return {
        success: false,
        message: `Schema test failed: ${error instanceof Error ? error.message : String(error)}`,
        data: error
      };
    }
  }

  /**
   * Run all database tests
   */
  async runAllTests(): Promise<void> {
    console.log("🧪 Starting Database Permit Tests");
    console.log("=================================");

    const tests = [
      { name: "Database Schema Check", test: () => this.testDatabaseSchema() },
      { name: "Permit Fetching Test", test: () => this.testPermitFetching() },
      { name: "Problematic Filters Test", test: () => this.testProblematicFilters() },
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
      console.log("🎉 All tests passed! The permit fetching should be working correctly.");
    } else {
      console.log(`⚠️  ${failed} test(s) failed. Check the output above for details.`);
    }
  }
}

// Export for use in other files
export { DatabasePermitTester, TEST_WALLET_ADDRESS, EXPECTED_PERMITS_COUNT };

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

  const tester = new DatabasePermitTester(supabaseUrl, supabaseKey);
  await tester.runAllTests();
}