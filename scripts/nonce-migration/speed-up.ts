#!/usr/bin/env bun
/**
 * Speed up remaining transactions by replacing them with higher gas prices
 */

import { createPublicClient, createWalletClient, http, type Address, parseAbi, parseGwei, formatGwei, formatEther } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { gnosis } from "viem/chains";

const PERMIT3_ADDRESS = "0xd635918A75356D133d5840eE5c9ED070302C9C60" as Address;
const RPC_URL = process.env.GNOSIS_RPC_URL || "https://rpc.ubq.fi/100";

const permit3Abi = parseAbi([
  "function invalidateUnorderedNonces(uint256 wordPos, uint256 mask) external",
]);

async function main() {
  if (!process.env.MIGRATION_PRIVATE_KEY) {
    console.error("❌ MIGRATION_PRIVATE_KEY not set");
    process.exit(1);
  }
  
  // Setup clients
  const account = privateKeyToAccount(process.env.MIGRATION_PRIVATE_KEY as `0x${string}`);
  const publicClient = createPublicClient({
    chain: gnosis,
    transport: http(RPC_URL),
  });
  const walletClient = createWalletClient({
    account,
    chain: gnosis,
    transport: http(RPC_URL),
  });
  
  // Get current status
  const currentNonce = await publicClient.getTransactionCount({
    address: account.address,
    blockTag: "latest"
  });
  const pendingNonce = await publicClient.getTransactionCount({
    address: account.address,
    blockTag: "pending"
  });
  
  // Get current gas price and calculate higher price
  const currentGasPrice = await publicClient.getGasPrice();
  // Use 5x current gas price to ensure quick confirmation
  const speedUpGasPrice = (currentGasPrice * 5n);
  
  // Load cache to get transactions
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
  
  const startingNonce = 245;
  const confirmedCount = currentNonce - startingNonce;
  const totalNeeded = allTransactions.length;
  const remainingCount = totalNeeded - confirmedCount;
  
  console.log("=".repeat(50));
  console.log("🚀 SPEEDING UP MIGRATION TRANSACTIONS");
  console.log("=".repeat(50));
  console.log(`Wallet: ${account.address}`);
  console.log(`Current confirmed: ${confirmedCount}/${totalNeeded}`);
  console.log(`Pending in mempool: ${pendingNonce - currentNonce}`);
  console.log(`Remaining needed: ${remainingCount}`);
  console.log();
  console.log("Gas prices:");
  console.log(`  Current network: ${formatGwei(currentGasPrice)} Gwei`);
  console.log(`  Speed up price: ${formatGwei(speedUpGasPrice)} Gwei (5x)`);
  
  // Calculate cost estimate
  const gasPerTx = 100000n; // Our fixed gas limit
  const costPerTx = gasPerTx * speedUpGasPrice;
  const totalCost = costPerTx * BigInt(remainingCount);
  const totalCostUSD = Number(formatEther(totalCost)) * 1.0; // xDAI is ~$1
  
  console.log();
  console.log("Cost estimate:");
  console.log(`  Per transaction: ${formatEther(costPerTx)} xDAI`);
  console.log(`  Total for ${remainingCount} txs: ${formatEther(totalCost)} xDAI`);
  console.log(`  ≈ $${totalCostUSD.toFixed(6)} USD`);
  
  if (totalCostUSD > 0.20) {
    console.log();
    console.log("⚠️ WARNING: Total cost exceeds $0.20 budget!");
    console.log("Adjusting gas price...");
    
    // Calculate max gas price within budget
    const maxTotalCost = parseEther("0.20"); // $0.20 in xDAI
    const maxGasPrice = maxTotalCost / (gasPerTx * BigInt(remainingCount));
    
    console.log(`Adjusted gas price: ${formatGwei(maxGasPrice)} Gwei`);
    // Use the adjusted price, but ensure it's still higher than current
    const finalGasPrice = maxGasPrice > currentGasPrice ? maxGasPrice : currentGasPrice + 1n;
    console.log(`Final gas price: ${formatGwei(finalGasPrice)} Gwei`);
  }
  
  console.log();
  console.log("Ready to speed up transactions? This will:");
  console.log("1. Replace pending transactions with higher gas");
  console.log("2. Send new transactions for any missing ones");
  console.log();
  
  // Get the transactions we need to send (skipping confirmed ones)
  const txsToSend = allTransactions.slice(confirmedCount);
  
  if (txsToSend.length === 0) {
    console.log("✅ All transactions already confirmed!");
    return;
  }
  
  console.log(`Sending ${txsToSend.length} transactions with higher gas...`);
  console.log();
  
  let nonce = currentNonce;
  let sent = 0;
  let failed = 0;
  const hashes: string[] = [];
  
  for (let i = 0; i < txsToSend.length; i++) {
    const tx = txsToSend[i];
    
    try {
      const hash = await walletClient.writeContract({
        address: PERMIT3_ADDRESS,
        abi: permit3Abi,
        functionName: "invalidateUnorderedNonces",
        args: [tx.wordPos, tx.bitmap],
        nonce,
        gas: 100000n,
        gasPrice: speedUpGasPrice,
      });
      
      hashes.push(hash);
      sent++;
      
      // Progress update every 10 transactions
      if ((i + 1) % 10 === 0) {
        const progress = Math.round(((i + 1) / txsToSend.length) * 100);
        console.log(`📊 Progress: ${progress}% (${sent} sent, ${failed} failed)`);
      }
      
      nonce++;
      
      // Small delay to avoid overwhelming RPC
      await new Promise(r => setTimeout(r, 50)); // 50ms between transactions
      
    } catch (error: any) {
      // If error is "already known", that's fine - it means our replacement worked
      if (error.message?.includes("already known") || error.message?.includes("AlreadyKnown")) {
        sent++;
      } else {
        console.error(`❌ TX ${i + 1} failed: ${error.message?.substring(0, 50)}...`);
        failed++;
      }
      nonce++;
      
      // Small delay after error
      await new Promise(r => setTimeout(r, 100));
    }
  }
  
  // Final report
  console.log();
  console.log("=".repeat(50));
  console.log("🎉 SPEED UP COMPLETE");
  console.log("=".repeat(50));
  console.log(`✅ Sent/Replaced: ${sent}`);
  console.log(`❌ Failed: ${failed}`);
  
  if (hashes.length > 0) {
    console.log("\n🔗 Sample transaction hashes:");
    hashes.slice(0, 5).forEach((hash, i) => {
      console.log(`  ${i + 1}. https://gnosisscan.io/tx/${hash}`);
    });
    
    const filename = `migration-speedup-hashes.json`;
    console.log(`\n💾 ${hashes.length} transaction hashes saved to: ${filename}`);
    await Bun.write(filename, JSON.stringify(hashes, null, 2));
  }
  
  console.log();
  console.log("⏳ Transactions should confirm within the next few blocks!");
  console.log("   Check status at: https://gnosisscan.io/address/" + account.address);
}

main().catch(error => {
  console.error("❌ Fatal error:", error);
  process.exit(1);
});