#!/usr/bin/env bun
/**
 * Ultra-simple nonce migration - just blast all transactions
 * No waiting for confirmations, just send them all sequentially
 */

import { createPublicClient, createWalletClient, http, type Address, parseAbi } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { gnosis } from "viem/chains";

const PERMIT3_ADDRESS = "0xd635918A75356D133d5840eE5c9ED070302C9C60" as Address;
const RPC_URL = process.env.GNOSIS_RPC_URL || "https://rpc.gnosischain.com";

const permit3Abi = parseAbi([
  "function invalidateUnorderedNonces(uint256 wordPos, uint256 mask) external",
]);

async function main() {
  // Check for private key
  if (!process.env.MIGRATION_PRIVATE_KEY) {
    console.error("❌ MIGRATION_PRIVATE_KEY not set");
    process.exit(1);
  }
  
  // Load cache
  const cache = await Bun.file("cache/migration-cache-1756834755717.json").json();
  const pendingBatches = cache.migrationBatches?.filter((b: any) => b.status === "pending") || [];
  
  if (pendingBatches.length === 0) {
    console.log("✅ No pending migrations");
    return;
  }
  
  // Collect all transactions
  const transactions: Array<{wordPos: bigint, bitmap: bigint}> = [];
  for (const batch of pendingBatches) {
    for (const [wordPos, bitmap] of Object.entries(batch.wordPosMap || {})) {
      transactions.push({
        wordPos: BigInt(wordPos),
        bitmap: BigInt(bitmap as any)
      });
    }
  }
  
  console.log(`📦 ${transactions.length} transactions to send`);
  
  // Setup wallet
  const account = privateKeyToAccount(process.env.MIGRATION_PRIVATE_KEY as `0x${string}`);
  console.log(`💰 Wallet: ${account.address}`);
  
  const publicClient = createPublicClient({
    chain: gnosis,
    transport: http(RPC_URL),
  });
  
  const walletClient = createWalletClient({
    account,
    chain: gnosis,
    transport: http(RPC_URL),
  });
  
  // Get starting nonce
  let nonce = await publicClient.getTransactionCount({
    address: account.address,
    blockTag: "pending",
  });
  
  console.log(`🔢 Starting nonce: ${nonce}`);
  console.log("🚀 Blasting transactions...\n");
  
  const hashes: string[] = [];
  let sent = 0;
  let failed = 0;
  
  // Send all transactions without waiting
  for (let i = 0; i < transactions.length; i++) {
    const tx = transactions[i];
    
    try {
      const hash = await walletClient.writeContract({
        address: PERMIT3_ADDRESS,
        abi: permit3Abi,
        functionName: "invalidateUnorderedNonces",
        args: [tx.wordPos, tx.bitmap],
        nonce,
        gas: 100000n,
      });
      
      hashes.push(hash);
      sent++;
      nonce++;
      
      // Progress update every 10 transactions
      if ((i + 1) % 10 === 0) {
        const progress = Math.round(((i + 1) / transactions.length) * 100);
        console.log(`📊 Progress: ${progress}% (${sent} sent, ${failed} failed)`);
      }
      
      // Small delay to avoid overwhelming RPC
      await new Promise(r => setTimeout(r, 100)); // 100ms between transactions
      
    } catch (error: any) {
      console.error(`❌ TX ${i + 1} failed: ${error.message?.substring(0, 50)}...`);
      failed++;
      nonce++; // Still increment to avoid gaps
      
      // Longer delay after error
      await new Promise(r => setTimeout(r, 500));
    }
  }
  
  // Final report
  console.log("\n" + "=".repeat(50));
  console.log("🎉 BLAST COMPLETE");
  console.log("=".repeat(50));
  console.log(`✅ Sent: ${sent}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`📊 Success rate: ${Math.round((sent / transactions.length) * 100)}%`);
  
  if (hashes.length > 0) {
    console.log("\n🔗 First 10 transaction hashes:");
    hashes.slice(0, 10).forEach((hash, i) => {
      console.log(`  ${i + 1}. https://gnosisscan.io/tx/${hash}`);
    });
    
    console.log(`\n💾 All ${hashes.length} hashes saved to: migration-hashes.json`);
    await Bun.write("migration-hashes.json", JSON.stringify(hashes, null, 2));
  }
}

main().catch(error => {
  console.error("❌ Fatal error:", error);
  process.exit(1);
});