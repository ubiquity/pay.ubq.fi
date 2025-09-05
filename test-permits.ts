#!/usr/bin/env bun

import { DatabasePermitTester } from "./src/frontend/src/tests/database-permit-test.ts";

// Simple test runner for the database layer
async function main() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error("❌ Missing environment variables:");
    console.error("   SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
    process.exit(1);
  }

  console.log("🧪 Testing Permit Database Queries");
  console.log("==================================");
  console.log("This test verifies the fix described in PERMIT_DIAGNOSTIC_REPORT.md");
  console.log("");

  const tester = new DatabasePermitTester(supabaseUrl, supabaseKey);
  
  try {
    await tester.runAllTests();
  } catch (error) {
    console.error("Test execution failed:", error);
    process.exit(1);
  }
}

main().catch(console.error);