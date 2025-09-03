#!/usr/bin/env bun
/**
 * Continue migration from where we left off
 * Skip the first 519 transactions that were already sent
 */

import { createPublicClient, createWalletClient, http, type Address, parseAbi } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { gnosis } from "viem/chains";

const PERMIT3_ADDRESS = "0xd635918A75356D133d5840eE5c9ED070302C9C60" as Address;
const RPC_URL = process.env.GNOSIS_RPC_URL || "https://rpc.gnosischain.com";
const SKIP_FIRST = 519; // Already sent these

const permit3Abi = parseAbi([
  "function invalidateUnorderedNonces(uint256 wordPos, uint256 mask) external",
]);

async function main() {
  if (!process.env.MIGRATION_PRIVATE_KEY) {
    console.error("❌ MIGRATION_PRIVATE_KEY not set");
    process.exit(1);
  }
  
  // Load cache
  const cache = await Bun.file("cache/migration-cache-1756834755717.json").json();
  const pendingBatches = cache.migrationBatches?.filter((b: any) => b.status === "pending") || [];
  
  // Collect all transactions
  const allTransactions: Array<{wordPos: bigint, bitmap: bigint}> = [];
  for (const batch of pendingBatches) {
    for (const [wordPos, bitmap] of Object.entries(batch.wordPosMap || {})) {
      allTransactions.push({
        wordPos: BigInt(wordPos),
        bitmap: BigInt(bitmap as any)
      });
    }
  }
  
  // Skip already sent transactions
  const transactions = allTransactions.slice(SKIP_FIRST);
  
  console.log(`📦 Total: ${allTransactions.length} transactions`);
  console.log(`✅ Already sent: ${SKIP_FIRST}`);
  console.log(`📤 Remaining: ${transactions.length} transactions to send`);
  
  if (transactions.length === 0) {
    console.log("✅ All transactions already sent!");
    return;
  }
  
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
  
  // Get current nonce
  let nonce = await publicClient.getTransactionCount({
    address: account.address,
    blockTag: "pending",
  });
  
  console.log(`🔢 Current nonce: ${nonce}`);
  console.log("🚀 Continuing migration...\n");
  
  const hashes: string[] = [];
  let sent = 0;
  let failed = 0;
  
  // Send remaining transactions
  for (let i = 0; i < transactions.length; i++) {
    const tx = transactions[i];
    const txNum = SKIP_FIRST + i + 1;
    
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
        console.log(`📊 Progress: ${txNum}/${allTransactions.length} (${progress}% of remaining)`);
      }
      
      // Small delay
      await new Promise(r => setTimeout(r, 100));
      
    } catch (error: any) {
      console.error(`❌ TX ${txNum} failed: ${error.message?.substring(0, 50)}...`);
      failed++;
      nonce++;
      
      // Longer delay after error
      await new Promise(r => setTimeout(r, 500));
    }
  }
  
  // Final report
  console.log("\n" + "=".repeat(50));
  console.log("🎉 MIGRATION COMPLETE");
  console.log("=".repeat(50));
  console.log(`✅ Sent in this batch: ${sent}`);
  console.log(`❌ Failed in this batch: ${failed}`);
  console.log(`📊 Total sent: ${SKIP_FIRST + sent}/${allTransactions.length}`);
  console.log(`📊 Overall success rate: ${Math.round(((SKIP_FIRST + sent) / allTransactions.length) * 100)}%`);
  
  if (hashes.length > 0) {
    console.log("\n🔗 Sample transaction hashes:");
    hashes.slice(0, 5).forEach((hash, i) => {
      console.log(`  ${i + 1}. https://gnosisscan.io/tx/${hash}`);
    });
    
    const filename = `migration-hashes-batch2.json`;
    console.log(`\n💾 ${hashes.length} new hashes saved to: ${filename}`);
    await Bun.write(filename, JSON.stringify(hashes, null, 2));
  }
}

main().catch(error => {
  console.error("❌ Fatal error:", error);
  process.exit(1);
});