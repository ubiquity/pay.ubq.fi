#!/usr/bin/env bun
/**
 * Sequential Migration Script
 * 
 * Reads from cache and sends transactions sequentially.
 * Waits for confirmations with timeout handling.
 * Provides progress tracking and error recovery.
 */

import { createWalletClient, http, type Address, parseAbi, createPublicClient, type WalletClient } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { gnosis } from "viem/chains";
import { readFileSync, existsSync } from "fs";
import path from "path";

// Contract configuration
const PERMIT3_ADDRESS = "0xd635918A75356D133d5840eE5c9ED070302C9C60" as Address;
const RPC_URL = process.env.GNOSIS_RPC_URL || "https://rpc.ubq.fi/100";

const permit3Abi = parseAbi([
  "function invalidateUnorderedNonces(uint256 wordPos, uint256 mask)",
]);

interface MigrationCache {
  migrationBatches: Array<{
    owner: Address;
    status: "pending" | "submitted" | "completed";
    wordPosMap: Record<string, string>; // wordPos -> bitmap
  }>;
}

async function main() {
  const isDryRun = process.argv.includes("--dry-run");
  
  console.log("🚀 Sequential Nonce Migration");
  console.log("=============================");
  console.log(`Target contract: ${PERMIT3_ADDRESS}`);
  console.log(`RPC URL: ${RPC_URL}`);
  console.log(`Mode: ${isDryRun ? "DRY-RUN" : "LIVE"}`);
  console.log("");

  // Check for private key
  if (!process.env.MIGRATION_PRIVATE_KEY && !isDryRun) {
    throw new Error("MIGRATION_PRIVATE_KEY environment variable must be set for live migration");
  }

  // Find the latest migration cache
  const cacheDir = path.join(process.cwd(), "cache");
  if (!existsSync(cacheDir)) {
    throw new Error("No cache directory found. Run extract-migration-nonces.ts first.");
  }

  const cacheFiles = require("fs").readdirSync(cacheDir)
    .filter((f: string) => f.startsWith("migration-cache-") && f.endsWith(".json"))
    .sort()
    .reverse();

  if (cacheFiles.length === 0) {
    throw new Error("No migration cache files found. Run extract-migration-nonces.ts first.");
  }

  const cacheFile = path.join(cacheDir, cacheFiles[0]);
  console.log(`📂 Using cache: ${cacheFiles[0]}`);
  
  const cache: MigrationCache = JSON.parse(readFileSync(cacheFile, "utf-8"));
  
  // Setup clients
  const publicClient = createPublicClient({
    chain: gnosis,
    transport: http(RPC_URL)
  });

  let walletClient: WalletClient | undefined;
  if (!isDryRun) {
    const account = privateKeyToAccount(process.env.MIGRATION_PRIVATE_KEY as `0x${string}`);
    walletClient = createWalletClient({
      account,
      chain: gnosis,
      transport: http(RPC_URL)
    });
    console.log(`💰 Using account: ${account.address}`);
  }

  // Count total transactions
  let totalTxs = 0;
  for (const batch of cache.migrationBatches) {
    if (batch.status === "pending") {
      totalTxs += Object.keys(batch.wordPosMap).length;
    }
  }

  console.log(`📊 Found ${totalTxs} transactions to send`);
  console.log("");

  if (isDryRun) {
    console.log("🧪 DRY RUN - No transactions will be sent");
    console.log("");
  }

  let txCount = 0;
  let successCount = 0;
  let failureCount = 0;

  // Get starting nonce if not dry run
  let currentNonce: number | undefined;
  if (!isDryRun && walletClient) {
    currentNonce = await publicClient.getTransactionCount({
      address: walletClient.account!.address,
      blockTag: "pending"
    });
    console.log(`🔢 Starting nonce: ${currentNonce}`);
    console.log("");
  }

  console.log("🚀 Starting sequential migration...");
  console.log("");

  for (const batch of cache.migrationBatches) {
    if (batch.status !== "pending") continue;

    console.log(`👤 Processing batch for owner: ${batch.owner}`);
    
    for (const [wordPosStr, bitmapStr] of Object.entries(batch.wordPosMap)) {
      txCount++;
      const wordPos = BigInt(wordPosStr);
      const bitmap = BigInt(bitmapStr);

      console.log(`📋 Transaction ${txCount}/${totalTxs}:`);
      console.log(`  📤 WordPos: ${wordPos}, Bitmap: 0x${bitmap.toString(16)}`);

      if (isDryRun) {
        console.log(`  🧪 DRY RUN: Would send invalidateUnorderedNonces(${wordPos}, ${bitmap})`);
        successCount++;
      } else if (walletClient && currentNonce !== undefined) {
        try {
          console.log(`     Nonce: ${currentNonce}`);
          
          const hash = await walletClient.writeContract({
            address: PERMIT3_ADDRESS,
            abi: permit3Abi,
            functionName: "invalidateUnorderedNonces",
            args: [wordPos, bitmap],
            nonce: currentNonce,
            gas: 100000n,
            chain: gnosis,
            account: walletClient.account!,
          });

          console.log(`  ✅ Transaction sent: ${hash}`);
          console.log(`     ⏳ Waiting for confirmation...`);
          
          const receipt = await publicClient.waitForTransactionReceipt({ 
            hash,
            timeout: 60000 // 1 minute timeout
          });
          
          console.log(`     ✅ Confirmed in block ${receipt.blockNumber}`);
          console.log(`     🔗 View on Gnosisscan: https://gnosisscan.io/tx/${hash}`);
          
          successCount++;
          currentNonce++;
          
        } catch (error) {
          console.log(`     ❌ Transaction failed: ${error}`);
          failureCount++;
          currentNonce++; // Increment nonce even on failure to avoid gaps
        }
      }

      console.log(`📊 Progress: ${Math.round((txCount / totalTxs) * 100)}% (${successCount} sent, ${failureCount} failed)`);
      
      if (txCount < totalTxs) {
        console.log(`⏳ Waiting 2 seconds before next transaction...`);
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
      
      console.log("");
    }
  }

  console.log("==================================================");
  console.log("🎉 MIGRATION COMPLETE!");
  console.log("==================================================");
  console.log(`✅ Successful transactions: ${successCount}`);
  console.log(`❌ Failed transactions: ${failureCount}`);
  console.log(`📊 Success rate: ${Math.round((successCount / (successCount + failureCount)) * 100)}%`);
}

if (import.meta.main) {
  main().catch(console.error);
}
