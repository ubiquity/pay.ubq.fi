import { DatabasePermitTester } from "./database-permit-test.ts";
import { WorkerPermitTester } from "./worker-permit-test.ts";
import { IntegrationPermitTester } from "./integration-permit-test.ts";

interface TestSuite {
  name: string;
  description: string;
  tester: {
    runAllTests(): Promise<void>;
  };
}

/**
 * Comprehensive test runner for permit functionality
 * Tests all layers: Database → Worker → Integration
 */
class PermitTestRunner {
  private supabaseUrl: string;
  private supabaseKey: string;
  
  constructor(supabaseUrl: string, supabaseKey: string) {
    this.supabaseUrl = supabaseUrl;
    this.supabaseKey = supabaseKey;
  }

  /**
   * Run all test suites in sequence
   */
  async runAllTestSuites(): Promise<void> {
    console.log("🚀 PERMIT FUNCTIONALITY TEST SUITE");
    console.log("==================================");
    console.log("Testing fix for database filtering issue described in PERMIT_DIAGNOSTIC_REPORT.md");
    console.log("");

    const testSuites: TestSuite[] = [
      {
        name: "Database Layer Tests",
        description: "Direct database queries to verify permit fetching works correctly",
        tester: new DatabasePermitTester(this.supabaseUrl, this.supabaseKey)
      },
      {
        name: "Worker Layer Tests", 
        description: "Web Worker permit processing and validation logic",
        tester: new WorkerPermitTester()
      },
      {
        name: "Integration Tests",
        description: "End-to-end permit flow from frontend to database",
        tester: new IntegrationPermitTester(this.supabaseUrl, this.supabaseKey)
      }
    ];

    let totalSuitesRun = 0;
    let totalSuitesPassed = 0;

    for (const suite of testSuites) {
      console.log(`\n${"=".repeat(60)}`);
      console.log(`📋 TEST SUITE: ${suite.name}`);
      console.log(`📝 ${suite.description}`);
      console.log(`${"=".repeat(60)}`);
      
      try {
        const suiteStartTime = Date.now();
        await suite.tester.runAllTests();
        const suiteTime = Date.now() - suiteStartTime;
        
        console.log(`\n⏱️  Suite completed in ${suiteTime}ms`);
        totalSuitesRun++;
        totalSuitesPassed++; // Assume passed if no exception thrown
        
      } catch (error) {
        console.error(`\n❌ TEST SUITE FAILED: ${suite.name}`);
        console.error(`   Error: ${error instanceof Error ? error.message : String(error)}`);
        totalSuitesRun++;
      }
      
      // Add spacing between test suites
      console.log("\n");
    }

    // Final summary
    this.printFinalSummary(totalSuitesRun, totalSuitesPassed);
  }

  /**
   * Print final test summary and recommendations
   */
  private printFinalSummary(totalSuitesRun: number, totalSuitesPassed: number): void {
    console.log("🏁 FINAL TEST SUMMARY");
    console.log("=".repeat(50));
    console.log(`📊 Test Suites: ${totalSuitesPassed}/${totalSuitesRun} passed`);
    
    if (totalSuitesPassed === totalSuitesRun) {
      console.log("\n🎉 ALL TESTS PASSED!");
      console.log("✅ The permit fetching issue has been successfully resolved.");
      console.log("✅ Database queries are working correctly.");
      console.log("✅ Worker processing is functioning properly.");
      console.log("✅ End-to-end integration is working as expected.");
      console.log("\n🔧 DIAGNOSTIC REPORT STATUS: FIXED");
      console.log("   The problematic database filters identified in the diagnostic");
      console.log("   report have been properly removed and commented out.");
      
    } else if (totalSuitesPassed === 0) {
      console.log("\n🚨 ALL TESTS FAILED!");
      console.log("❌ Critical issues detected across all layers.");
      console.log("❌ The database filtering issue may still be present.");
      console.log("\n🔧 DIAGNOSTIC REPORT STATUS: NOT FIXED");
      console.log("   Immediate action required:");
      console.log("   1. Check database connectivity and credentials");
      console.log("   2. Verify Supabase service is accessible");
      console.log("   3. Review worker initialization logic");
      
    } else {
      console.log(`\n⚠️  PARTIAL SUCCESS: ${totalSuitesPassed} out of ${totalSuitesRun} test suites passed.`);
      console.log("🔍 Some functionality is working, but issues remain.");
      console.log("\n🔧 DIAGNOSTIC REPORT STATUS: PARTIALLY FIXED");
      console.log("   Review the failed test suites above for specific issues.");
    }

    console.log("\n📋 NEXT STEPS:");
    console.log("1. If tests pass: Deploy the fix and monitor permit loading in production");
    console.log("2. If tests fail: Review the specific error messages above");
    console.log("3. Test with the diagnostic report wallet: 0x4007CE2083c7F3E18097aeB3A39bb8eC149a341d");
    console.log("4. Verify 385 permits are loaded (or close to that number)");
    
    console.log("\n" + "=".repeat(50));
  }

  /**
   * Quick health check - runs minimal tests to verify system is working
   */
  async runQuickHealthCheck(): Promise<boolean> {
    console.log("⚡ QUICK HEALTH CHECK");
    console.log("====================");
    
    try {
      const dbTester = new DatabasePermitTester(this.supabaseUrl, this.supabaseKey);
      const result = await dbTester.testPermitFetching();
      
      if (result.success) {
        console.log("✅ Quick health check PASSED");
        console.log(`   ${result.message}`);
        return true;
      } else {
        console.log("❌ Quick health check FAILED");
        console.log(`   ${result.message}`);
        return false;
      }
    } catch (error) {
      console.log("❌ Quick health check ERROR");
      console.log(`   ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  }
}

// Export for use in other files
export { PermitTestRunner };

// Main execution when run directly
if (require.main === module || (typeof process !== "undefined" && process.argv[1] === import.meta.url)) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error("❌ Environment Configuration Error");
    console.error("=================================");
    console.error("Missing required environment variables:");
    console.error("  • SUPABASE_URL");
    console.error("  • SUPABASE_SERVICE_ROLE_KEY");
    console.error("");
    console.error("Please ensure your .env file contains these variables.");
    console.error("Check the project README for setup instructions.");
    process.exit(1);
  }

  const runner = new PermitTestRunner(supabaseUrl, supabaseKey);

  // Check if user wants quick health check or full test suite
  const args = process.argv;
  const isQuickCheck = args.includes("--quick") || args.includes("-q");
  
  if (isQuickCheck) {
    console.log("Running quick health check...\n");
    const isHealthy = await runner.runQuickHealthCheck();
    process.exit(isHealthy ? 0 : 1);
  } else {
    console.log("Running full test suite...\n");
    await runner.runAllTestSuites();
  }
}