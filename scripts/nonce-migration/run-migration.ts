#!/usr/bin/env bun
/**
 * Dead-simple sequential nonce migration
 * Reads from cache and sends transactions one by one
 */

import { createPublicClient, createWalletClient, http, type Address, parseAbi } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { gnosis } from "viem/chains";

// Configuration
const PERMIT3_ADDRESS = "0xd635918A75356D133d5840eE5c9ED070302C9C60" as Address;
const RPC_URL = process.env.GNOSIS_RPC_URL || "https://rpc.ubq.fi/100";

// ABI for invalidateUnorderedNonces
const permit3Abi = parseAbi([
  "function invalidateUnorderedNonces(uint256 wordPos, uint256 mask) external",
]);

async function main() {
  const isDryRun = process.argv.includes("--dry-run");
  
  // Use specific cache file or find most recent
  let latestCache = "cache/migration-cache-1756834755717.json";
  
  // Check if file exists
  const exists = await Bun.file(latestCache).exists();
  if (!exists) {
    console.error("❌ Cache file not found:", latestCache);
    process.exit(1);
  }
  
  console.log(`📂 Using cache: ${latestCache}`);
  const cache = await Bun.file(latestCache).json();
  
  // Get pending batches
  const pendingBatches = cache.migrationBatches?.filter((b: any) => b.status === "pending") || [];
  
  if (pendingBatches.length === 0) {
    console.log("✅ No pending migrations found");
    return;
  }
  
  console.log(`\n📦 Found ${pendingBatches.length} pending batch(es) to migrate`);
  
  // Count total transactions needed
  let totalTxCount = 0;
  for (const batch of pendingBatches) {
    totalTxCount += Object.keys(batch.wordPosMap || {}).length;
  }
  
  console.log(`📊 Total transactions needed: ${totalTxCount}`);
  
  if (isDryRun) {
    console.log("\n🔍 DRY RUN MODE - No transactions will be sent");
    console.log("\nTransactions that would be sent:");
    
    for (const batch of pendingBatches) {
      console.log(`\n👤 Owner: ${batch.owner}`);
      for (const [wordPos, bitmap] of Object.entries(batch.wordPosMap || {})) {
        console.log(`  - WordPos: ${wordPos}, Bitmap: ${bitmap}`);
      }
    }
    
    console.log("\n✅ Dry run complete");
    return;
  }
  
  // Check for private key
  if (!process.env.MIGRATION_PRIVATE_KEY) {
    console.error("❌ MIGRATION_PRIVATE_KEY not set in environment");
    process.exit(1);
  }
  
  // Setup wallet
  const account = privateKeyToAccount(process.env.MIGRATION_PRIVATE_KEY as `0x${string}`);
  console.log(`\n💰 Using wallet: ${account.address}`);
  
  // Setup clients
  const publicClient = createPublicClient({
    chain: gnosis,
    transport: http(RPC_URL),
  });
  
  const walletClient = createWalletClient({
    account,
    chain: gnosis,
    transport: http(RPC_URL),
  });
  
  // Get initial nonce
  let nonce = await publicClient.getTransactionCount({
    address: account.address,
    blockTag: "pending",
  });
  
  console.log(`🔢 Starting nonce: ${nonce}`);
  console.log("\n🚀 Starting sequential migration...\n");
  
  const results: Array<{ success: boolean; hash?: string; error?: string }> = [];
  let txCount = 0;
  
  // Process each batch
  for (const batch of pendingBatches) {
    console.log(`\n👤 Processing batch for owner: ${batch.owner}`);
    
    for (const [wordPos, bitmap] of Object.entries(batch.wordPosMap || {})) {
      txCount++;
      console.log(`\n📤 Transaction ${txCount}/${totalTxCount}:`);
      console.log(`  WordPos: ${wordPos}`);
      console.log(`  Bitmap: ${bitmap}`);
      console.log(`  Nonce: ${nonce}`);
      
      try {
        // Send transaction
        const hash = await walletClient.writeContract({
          address: PERMIT3_ADDRESS,
          abi: permit3Abi,
          functionName: "invalidateUnorderedNonces",
          args: [BigInt(wordPos), BigInt(bitmap as any)],
          nonce,
          gas: 100000n, // Fixed gas limit
        });
        
        console.log(`  ✅ Sent: ${hash}`);
        
        // Wait for confirmation
        console.log(`  ⏳ Waiting for confirmation...`);
        const receipt = await publicClient.waitForTransactionReceipt({
          hash,
          timeout: 60000,
        });
        
        console.log(`  ✅ Confirmed in block ${receipt.blockNumber}`);
        console.log(`  🔗 https://gnosisscan.io/tx/${hash}`);
        
        results.push({ success: true, hash });
        nonce++; // Increment for next transaction
        
        // Small delay between transactions
        if (txCount < totalTxCount) {
          console.log(`  ⏳ Waiting 2 seconds...`);
          await new Promise(r => setTimeout(r, 2000));
        }
        
      } catch (error: any) {
        console.error(`  ❌ Failed: ${error.message}`);
        results.push({ success: false, error: error.message });
        
        // Still increment nonce to avoid gaps
        nonce++;
        
        // Wait a bit longer after error
        console.log(`  ⏳ Waiting 5 seconds after error...`);
        await new Promise(r => setTimeout(r, 5000));
      }
      
      // Progress update
      const progress = Math.round((txCount / totalTxCount) * 100);
      const successCount = results.filter(r => r.success).length;
      const failCount = results.filter(r => !r.success).length;
      console.log(`\n📊 Progress: ${progress}% (${successCount} success, ${failCount} failed)`);
    }
  }
  
  // Final report
  console.log("\n" + "=".repeat(50));
  console.log("🎉 MIGRATION COMPLETE");
  console.log("=".repeat(50));
  
  const successCount = results.filter(r => r.success).length;
  const failCount = results.filter(r => !r.success).length;
  
  console.log(`✅ Successful: ${successCount}`);
  console.log(`❌ Failed: ${failCount}`);
  console.log(`📊 Success rate: ${Math.round((successCount / totalTxCount) * 100)}%`);
  
  if (successCount > 0) {
    console.log("\n🔗 Transaction hashes:");
    results.filter(r => r.success).forEach((r, i) => {
      console.log(`  ${i + 1}. https://gnosisscan.io/tx/${r.hash}`);
    });
  }
  
  if (failCount > 0) {
    console.log("\n⚠️ Failed transactions need to be retried");
  }
}

// Export the main function as runMigration for use by other scripts
export async function runMigration(options: { dryRun?: boolean; cacheFile?: string } = {}) {
  // Override process.argv for option handling
  const originalArgv = process.argv;
  if (options.dryRun) {
    process.argv = [...process.argv, "--dry-run"];
  }
  
  try {
    await main();
  } finally {
    // Restore original argv
    process.argv = originalArgv;
  }
}

// Run the script if executed directly
if (import.meta.main) {
  main().catch(error => {
    console.error("❌ Fatal error:", error);
    process.exit(1);
  });
}