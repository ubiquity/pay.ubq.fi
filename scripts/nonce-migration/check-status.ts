#!/usr/bin/env bun
/**
 * Check migration status by verifying which nonces are now invalidated
 */

import { createPublicClient, http, type Address, parseAbi } from "viem";
import { gnosis } from "viem/chains";

const PERMIT3_ADDRESS = "0xd635918A75356D133d5840eE5c9ED070302C9C60" as Address;
const RPC_URL = process.env.GNOSIS_RPC_URL || "https://rpc.gnosischain.com";

const permit3Abi = parseAbi([
  "function nonceBitmap(address owner, uint256 wordPos) view returns (uint256)",
]);

async function main() {
  // Load cache to get the migration data
  const cache = await Bun.file("cache/migration-cache-1756834755717.json").json();
  const pendingBatches = cache.migrationBatches?.filter((b: any) => b.status === "pending") || [];
  
  if (pendingBatches.length === 0) {
    console.log("No pending batches found in cache");
    return;
  }
  
  const publicClient = createPublicClient({
    chain: gnosis,
    transport: http(RPC_URL),
  });
  
  console.log("=".repeat(50));
  console.log("🔍 CHECKING MIGRATION STATUS");
  console.log("=".repeat(50));
  
  let totalWordPos = 0;
  let migratedWordPos = 0;
  
  // Check each batch
  for (const batch of pendingBatches) {
    console.log(`\n👤 Owner: ${batch.owner}`);
    console.log(`   Word positions to check: ${Object.keys(batch.wordPosMap || {}).length}`);
    
    let batchMigrated = 0;
    let sampleChecks = 0;
    const maxSamples = 10; // Only check first 10 to avoid timeout
    
    for (const [wordPos, expectedBitmap] of Object.entries(batch.wordPosMap || {})) {
      if (sampleChecks >= maxSamples) {
        console.log(`   (Checking first ${maxSamples} word positions as sample...)`);
        break;
      }
      
      totalWordPos++;
      sampleChecks++;
      
      try {
        const currentBitmap = await publicClient.readContract({
          address: PERMIT3_ADDRESS,
          abi: permit3Abi,
          functionName: "nonceBitmap",
          args: [batch.owner as Address, BigInt(wordPos)],
        });
        
        const expected = BigInt(expectedBitmap as any);
        const hasExpectedBits = (currentBitmap & expected) === expected;
        
        if (hasExpectedBits) {
          migratedWordPos++;
          batchMigrated++;
          console.log(`   ✅ WordPos ${wordPos}: Migrated`);
        } else {
          console.log(`   ❌ WordPos ${wordPos}: Not migrated (current: ${currentBitmap}, expected: ${expectedBitmap})`);
        }
      } catch (error) {
        console.log(`   ⚠️ WordPos ${wordPos}: Error checking`);
      }
    }
    
    console.log(`   Sample result: ${batchMigrated}/${sampleChecks} migrated`);
  }
  
  console.log("\n" + "=".repeat(50));
  console.log("📊 SAMPLE RESULTS");
  console.log("=".repeat(50));
  console.log(`Sampled word positions: ${totalWordPos}`);
  console.log(`Successfully migrated: ${migratedWordPos}`);
  console.log(`Sample success rate: ${Math.round((migratedWordPos / totalWordPos) * 100)}%`);
  
  // Check wallet transaction count
  const wallet = "0x9051eDa96dB419c967189F4Ac303a290F3327680";
  const nonce = await publicClient.getTransactionCount({
    address: wallet,
    blockTag: "latest"
  });
  
  console.log(`\n💰 Migration wallet: ${wallet}`);
  console.log(`   Total transactions sent: ${nonce}`);
  console.log(`   View on Gnosisscan: https://gnosisscan.io/address/${wallet}`);
}

main().catch(console.error);