#!/usr/bin/env bun
/**
 * Test Version of Simple Sequential Nonce Migration
 * 
 * This is a self-contained version for testing with a small set of nonces
 */

import { createPublicClient, createWalletClient, http, type Address, parseAbi } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { gnosis } from "viem/chains";

// Configuration
const PERMIT3_ADDRESS = "0xd635918A75356D133d5840eE5c9ED070302C9C60" as Address;
const RPC_URL = process.env.GNOSIS_RPC_URL || "https://rpc.gnosischain.com";

// ABI for invalidateUnorderedNonces function
const permit3Abi = parseAbi([
  "function invalidateUnorderedNonces(uint256 wordPos, uint256 mask) external",
]);

interface MigrationTransaction {
  wordPos: bigint;
  bitmap: bigint;
  nonces: bigint[];
  description: string;
}

/**
 * Calculate word position and bit position from nonce
 */
function nonceBitmap(nonce: bigint): { wordPos: bigint; bitPos: bigint } {
  const wordPos = nonce >> 8n;
  const bitPos = nonce & 0xffn;
  return { wordPos, bitPos };
}

/**
 * Group nonces by word position and create bitmaps
 */
function prepareMigrationTransactions(nonces: bigint[]): MigrationTransaction[] {
  const wordPosMap = new Map<bigint, { bitmap: bigint; nonces: bigint[] }>();
  
  // Group nonces by word position
  for (const nonce of nonces) {
    const { wordPos, bitPos } = nonceBitmap(nonce);
    
    if (!wordPosMap.has(wordPos)) {
      wordPosMap.set(wordPos, { bitmap: 0n, nonces: [] });
    }
    
    const entry = wordPosMap.get(wordPos)!;
    entry.bitmap |= (1n << bitPos);
    entry.nonces.push(nonce);
  }
  
  // Convert to transaction array
  return Array.from(wordPosMap.entries()).map(([wordPos, { bitmap, nonces }]) => ({
    wordPos,
    bitmap,
    nonces: nonces.sort((a, b) => Number(a - b)),
    description: `wordPos=${wordPos}, nonces=[${nonces.slice(0, 3).join(',')}${nonces.length > 3 ? '...' : ''}] (${nonces.length} total)`,
  }));
}

/**
 * Send a single transaction with retry logic
 */
async function sendTransaction(
  walletClient: ReturnType<typeof createWalletClient>,
  publicClient: ReturnType<typeof createPublicClient>,
  tx: MigrationTransaction,
  nonce: number,
  retryCount = 0
): Promise<{ success: boolean; txHash?: string; error?: string }> {
  const maxRetries = 3;
  
  try {
    console.log(`  📤 Sending: ${tx.description}`);
    console.log(`     Nonce: ${nonce}, WordPos: ${tx.wordPos}, Bitmap: 0x${tx.bitmap.toString(16)}`);
    
    // Send transaction with explicit nonce
    const txHash = await walletClient.writeContract({
      address: PERMIT3_ADDRESS,
      abi: permit3Abi,
      functionName: "invalidateUnorderedNonces",
      args: [tx.wordPos, tx.bitmap],
      nonce,
      gas: 100000n, // Fixed gas limit to avoid estimation issues
    });
    
    console.log(`  ✅ Transaction sent: ${txHash}`);
    
    // Wait for transaction receipt to ensure it's mined
    console.log(`     ⏳ Waiting for confirmation...`);
    const receipt = await publicClient.waitForTransactionReceipt({ 
      hash: txHash,
      timeout: 60000, // 60 second timeout
    });
    
    console.log(`     ✅ Confirmed in block ${receipt.blockNumber}`);
    console.log(`     🔗 View on Gnosisscan: https://gnosisscan.io/tx/${txHash}`);
    
    return { success: true, txHash };
    
  } catch (error: any) {
    const errorMsg = error.message || error.toString();
    console.log(`     ❌ Error: ${errorMsg}`);
    
    // Check if it's a nonce-related error that might resolve with retry
    const isRetryableError = errorMsg.toLowerCase().includes('nonce') || 
                           errorMsg.toLowerCase().includes('replacement') ||
                           errorMsg.toLowerCase().includes('underpriced');
    
    if (retryCount < maxRetries && isRetryableError) {
      console.log(`     🔄 Retrying (${retryCount + 1}/${maxRetries}) in 5 seconds...`);
      await new Promise(resolve => setTimeout(resolve, 5000));
      return sendTransaction(walletClient, publicClient, tx, nonce + 1, retryCount + 1);
    }
    
    return { success: false, error: errorMsg };
  }
}

/**
 * Main migration function
 */
async function runMigration(nonces: bigint[], isDryRun: boolean = false) {
  console.log("🚀 Simple Sequential Nonce Migration");
  console.log("===================================");
  console.log(`Target contract: ${PERMIT3_ADDRESS}`);
  console.log(`RPC URL: ${RPC_URL}`);
  console.log(`Mode: ${isDryRun ? 'DRY RUN' : 'LIVE'}`);
  console.log(`Nonces to migrate: ${nonces.length}`);
  
  // Validate environment
  if (!isDryRun && !process.env.MIGRATION_PRIVATE_KEY) {
    throw new Error("MIGRATION_PRIVATE_KEY environment variable required for live mode");
  }
  
  // Prepare transactions
  const transactions = prepareMigrationTransactions(nonces);
  console.log(`\n📦 Prepared ${transactions.length} transactions:`);
  transactions.forEach((tx, i) => {
    console.log(`   ${i + 1}. ${tx.description}`);
  });
  
  if (isDryRun) {
    console.log("\n🔍 DRY RUN - No transactions will be sent");
    console.log(`✅ Migration plan validated for ${nonces.length} nonces in ${transactions.length} transactions`);
    return;
  }
  
  // Initialize clients
  const account = privateKeyToAccount(process.env.MIGRATION_PRIVATE_KEY as `0x${string}`);
  console.log(`\n💰 Using account: ${account.address}`);
  
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
  let currentNonce = await publicClient.getTransactionCount({
    address: account.address,
    blockTag: 'pending',
  });
  
  console.log(`\n🔢 Starting nonce: ${currentNonce}`);
  console.log(`\n🚀 Sending ${transactions.length} transactions sequentially...\n`);
  
  // Send transactions sequentially
  const results = [];
  let successCount = 0;
  let failCount = 0;
  
  for (let i = 0; i < transactions.length; i++) {
    const tx = transactions[i];
    const txNumber = i + 1;
    
    console.log(`\n📋 Transaction ${txNumber}/${transactions.length}:`);
    
    const result = await sendTransaction(walletClient, publicClient, tx, currentNonce);
    results.push(result);
    
    if (result.success) {
      successCount++;
      currentNonce++; // Increment for next transaction
    } else {
      failCount++;
      console.log(`     ⚠️  Failed transaction, trying to continue with next nonce...`);
      currentNonce++; // Still increment to avoid nonce gaps
    }
    
    // Progress update
    const progress = Math.round((txNumber / transactions.length) * 100);
    console.log(`\n📊 Progress: ${progress}% (${successCount} sent, ${failCount} failed)`);
    
    // Small delay between transactions to avoid overwhelming RPC
    if (i < transactions.length - 1) {
      console.log(`⏳ Waiting 2 seconds before next transaction...`);
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
  
  // Final summary
  console.log("\n" + "=".repeat(50));
  console.log("🎉 MIGRATION COMPLETE!");
  console.log("=".repeat(50));
  console.log(`✅ Successful transactions: ${successCount}`);
  console.log(`❌ Failed transactions: ${failCount}`);
  console.log(`📊 Success rate: ${Math.round((successCount / transactions.length) * 100)}%`);
  
  if (successCount > 0) {
    console.log(`\n🔗 View transactions on Gnosisscan:`);
    results.forEach((result, i) => {
      if (result.success && result.txHash) {
        console.log(`   ${i + 1}. https://gnosisscan.io/tx/${result.txHash}`);
      }
    });
  }
  
  if (failCount > 0) {
    console.log(`\n⚠️  ${failCount} transactions failed. Check logs above for details.`);
    console.log(`   You may need to run the script again with the failed nonces.`);
  }
}

// Test with some example nonces (these are from the analysis we saw earlier)
async function main() {
  const args = process.argv.slice(2);
  const isDryRun = args.includes('--dry-run');
  
  // Test nonces - these should be some from your actual data that need migration
  // Based on what we saw in the analysis, let's use some smaller nonces for testing
  const testNonces = [
    4007n, // This was mentioned in your script names
    4008n,
    4009n,
    4010n, 
    4011n,
  ];
  
  console.log("⚠️  This is a TEST version with sample nonces!");
  console.log("Real nonces will be determined by running the analysis script first.\n");
  
  await runMigration(testNonces, isDryRun);
}

if (import.meta.main) {
  main().catch(error => {
    console.error("❌ Migration failed:", error);
    process.exit(1);
  });
}
