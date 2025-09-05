import { createClient } from "@supabase/supabase-js";
import type { Database } from "./src/frontend/src/database.types.ts";

// Environment variables - these should match your .env file
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_ANON_KEY environment variables");
  process.exit(1);
}

const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY);

// Test wallet address from the analysis report
const testWalletAddress = "0x4007CE2083c7F3E18097aeB3A39bb8eC149a341d";
const normalizedWalletAddress = testWalletAddress.toLowerCase();

// Table names
const PERMITS_TABLE = "permits";
const WALLETS_TABLE = "wallets";
const TOKENS_TABLE = "tokens";
const PARTNERS_TABLE = "partners";
const LOCATIONS_TABLE = "locations";

async function testDatabaseQueries() {
  console.log("🔍 Testing database queries for wallet:", testWalletAddress);
  console.log("Normalized address:", normalizedWalletAddress);
  console.log("=====================================");

  try {
    // Test 1: Simple permit count
    console.log("Test 1: Simple permit count (all permits)");
    const { count: totalPermits, error: countError } = await supabase
      .from(PERMITS_TABLE)
      .select("*", { count: "exact", head: true });
    
    if (countError) {
      console.error("Error counting permits:", countError);
    } else {
      console.log("Total permits in database:", totalPermits);
    }

    // Test 2: Unclaimed permits count
    console.log("\nTest 2: Unclaimed permits count");
    const { count: unclaimedPermits, error: unclaimedError } = await supabase
      .from(PERMITS_TABLE)
      .select("*", { count: "exact", head: true })
      .is("transaction", null);
    
    if (unclaimedError) {
      console.error("Error counting unclaimed permits:", unclaimedError);
    } else {
      console.log("Unclaimed permits in database:", unclaimedPermits);
    }

    // Test 3: Simple beneficiary query (without complex joins)
    console.log("\nTest 3: Simple beneficiary permits for test wallet");
    const simpleBeneficiaryQuery = await supabase
      .from(PERMITS_TABLE)
      .select(`
        id, nonce, amount, created,
        token:${TOKENS_TABLE}(address, network),
        partner:${PARTNERS_TABLE}(wallet:${WALLETS_TABLE}(address)),
        users(wallets(address))
      `)
      .is("transaction", null);

    console.log("Simple beneficiary query result:", {
      error: simpleBeneficiaryQuery.error?.message || null,
      dataLength: simpleBeneficiaryQuery.data?.length || 0
    });

    if (simpleBeneficiaryQuery.data && simpleBeneficiaryQuery.data.length > 0) {
      console.log("Sample permit:", {
        id: simpleBeneficiaryQuery.data[0].id,
        nonce: simpleBeneficiaryQuery.data[0].nonce,
        amount: simpleBeneficiaryQuery.data[0].amount,
        network: simpleBeneficiaryQuery.data[0].token?.network,
        users: simpleBeneficiaryQuery.data[0].users
      });

      // Check if any permits match our test wallet
      const matchingPermits = simpleBeneficiaryQuery.data.filter((permit: any) => {
        const userWallets = permit.users?.wallets;
        if (Array.isArray(userWallets)) {
          return userWallets.some((wallet: any) => 
            wallet.address?.toLowerCase() === normalizedWalletAddress
          );
        }
        return userWallets?.address?.toLowerCase() === normalizedWalletAddress;
      });
      console.log("Permits matching test wallet as beneficiary:", matchingPermits.length);
    }

    // Test 4: Complex beneficiary query (as used in worker)
    console.log("\nTest 4: Complex beneficiary query (worker version)");
    const beneficiaryJoinQuery = `
      *,
      token:${TOKENS_TABLE}(address, network),
      partner:${PARTNERS_TABLE}(wallet:${WALLETS_TABLE}(address)),
      location:${LOCATIONS_TABLE}(node_url),
      users!inner(
        wallets!inner(address)
      )
    `;

    const workerBeneficiaryQuery = await supabase
      .from(PERMITS_TABLE)
      .select(beneficiaryJoinQuery)
      .is("transaction", null)
      .filter("users.wallets.address", "ilike", normalizedWalletAddress);

    console.log("Worker beneficiary query result:", {
      error: workerBeneficiaryQuery.error?.message || null,
      dataLength: workerBeneficiaryQuery.data?.length || 0
    });

    if (workerBeneficiaryQuery.data && workerBeneficiaryQuery.data.length > 0) {
      console.log("Sample worker permit:", {
        id: workerBeneficiaryQuery.data[0].id,
        nonce: workerBeneficiaryQuery.data[0].nonce,
        amount: workerBeneficiaryQuery.data[0].amount,
        network: workerBeneficiaryQuery.data[0].token?.network
      });
    }

    // Test 5: Owner query
    console.log("\nTest 5: Owner query");
    const ownerJoinQuery = `
      *,
      token:${TOKENS_TABLE}(address, network),
      partner:${PARTNERS_TABLE}!inner(wallet:${WALLETS_TABLE}!inner(address)),
      location:${LOCATIONS_TABLE}(node_url),
      users(
        wallets(address)
      )
    `;

    const ownerQuery = await supabase
      .from(PERMITS_TABLE)
      .select(ownerJoinQuery)
      .is("transaction", null)
      .filter("partner.wallet.address", "ilike", normalizedWalletAddress);

    console.log("Owner query result:", {
      error: ownerQuery.error?.message || null,
      dataLength: ownerQuery.data?.length || 0
    });

    if (ownerQuery.data && ownerQuery.data.length > 0) {
      console.log("Sample owner permit:", {
        id: ownerQuery.data[0].id,
        nonce: ownerQuery.data[0].nonce,
        amount: ownerQuery.data[0].amount,
        network: ownerQuery.data[0].token?.network
      });
    }

    // Test 6: Network distribution
    console.log("\nTest 6: Network distribution");
    const networkQuery = await supabase
      .from(PERMITS_TABLE)
      .select(`
        token:${TOKENS_TABLE}(network)
      `)
      .is("transaction", null);

    if (networkQuery.data) {
      const networkCounts = networkQuery.data.reduce((acc: Record<string, number>, permit: any) => {
        const network = permit.token?.network || 'unknown';
        acc[network] = (acc[network] || 0) + 1;
        return acc;
      }, {});
      console.log("Permits by network:", networkCounts);
    }

  } catch (error) {
    console.error("Test failed:", error);
  }
}

// Run the tests
testDatabaseQueries()
  .then(() => console.log("\n✅ Database query tests completed"))
  .catch((error) => console.error("\n❌ Database query tests failed:", error));