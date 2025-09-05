#!/usr/bin/env bun
/**
 * Check Nonce Utility
 * 
 * Quick nonce checking utility that shows transactions sent from a starting point.
 * Useful for monitoring migration progress and debugging nonce issues.
 */

import { createPublicClient, http, type Address } from "viem";
import { gnosis } from "viem/chains";

const RPC_URL = process.env.GNOSIS_RPC_URL || "https://rpc.ubq.fi/100";

async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.log("Usage: bun scripts/check-nonce.ts <address> [starting-nonce]");
    console.log("");
    console.log("Examples:");
    console.log("  bun scripts/check-nonce.ts 0x1234567890123456789012345678901234567890");
    console.log("  bun scripts/check-nonce.ts 0x1234567890123456789012345678901234567890 42");
    console.log("");
    console.log("Environment variables:");
    console.log("  GNOSIS_RPC_URL - Custom RPC endpoint (default: https://rpc.ubq.fi/100)");
    process.exit(1);
  }

  const address = args[0] as Address;
  const startingNonce = args[1] ? parseInt(args[1]) : undefined;

  if (!address.match(/^0x[a-fA-F0-9]{40}$/)) {
    throw new Error("Invalid address format. Must be a 40-character hex string starting with 0x");
  }

  console.log("🔢 Nonce Checker");
  console.log("===============");
  console.log(`Address: ${address}`);
  console.log(`RPC URL: ${RPC_URL}`);
  console.log("");

  const publicClient = createPublicClient({
    chain: gnosis,
    transport: http(RPC_URL)
  });

  try {
    // Get current nonce (confirmed transactions)
    const confirmedNonce = await publicClient.getTransactionCount({
      address,
      blockTag: "latest"
    });

    // Get pending nonce (including pending transactions)
    const pendingNonce = await publicClient.getTransactionCount({
      address,
      blockTag: "pending"
    });

    console.log(`✅ Current nonce (confirmed): ${confirmedNonce}`);
    console.log(`⏳ Pending nonce (with pending): ${pendingNonce}`);
    console.log(`📊 Pending transactions: ${pendingNonce - confirmedNonce}`);
    console.log("");

    if (startingNonce !== undefined) {
      const transactionsSent = confirmedNonce - startingNonce;
      const pendingFromStart = pendingNonce - startingNonce;
      
      console.log("📈 Progress since starting nonce:");
      console.log(`   Starting nonce: ${startingNonce}`);
      console.log(`   Transactions confirmed: ${transactionsSent}`);
      console.log(`   Transactions pending: ${pendingFromStart - transactionsSent}`);
      console.log(`   Total transactions sent: ${pendingFromStart}`);
      console.log("");
    }

    console.log("🔗 Useful links:");
    console.log(`   Address on Gnosisscan: https://gnosisscan.io/address/${address}`);
    console.log(`   Transactions: https://gnosisscan.io/address/${address}#transactions`);
    
  } catch (error) {
    console.error("❌ Error checking nonce:", error);
    process.exit(1);
  }
}

if (import.meta.main) {
  main().catch(console.error);
}
