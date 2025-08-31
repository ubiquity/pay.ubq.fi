#!/usr/bin/env bun
import { createClient } from "@supabase/supabase-js";
import { createPublicClient, createWalletClient, http, type Address, type Chain } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { mainnet, optimism, gnosis, base, arbitrum, polygon, polygonZkEvm, scroll, celo } from "viem/chains";
import permit3Abi from "../src/frontend/src/fixtures/permit3-abi.json";
import type { Database } from "../src/frontend/src/database.types";

// Use the RPC URL from environment or default to ubq.fi RPC
const RPC_URL = process.env.RPC_URL || "https://rpc.ubq.fi";

// Chain configurations using the RPC_URL
const CHAIN_CONFIGS: Record<number, { chain: Chain; rpcUrl: string }> = {
  1: { chain: mainnet, rpcUrl: RPC_URL },
  10: { chain: optimism, rpcUrl: RPC_URL },
  100: { chain: gnosis, rpcUrl: RPC_URL },
  137: { chain: polygon, rpcUrl: RPC_URL },
  8453: { chain: base, rpcUrl: RPC_URL },
  42161: { chain: arbitrum, rpcUrl: RPC_URL },
  1101: { chain: polygonZkEvm, rpcUrl: RPC_URL },
  534352: { chain: scroll, rpcUrl: RPC_URL },
  42220: { chain: celo, rpcUrl: RPC_URL },
};

const PERMIT3_ADDRESS = "0xd635918A75356D133d5840eE5c9ED070302C9C60" as Address;

interface ClaimedPermit {
  nonce: string;
  network: number;
  owner: string;
  signature: string;
  transaction: string;
}

interface NonceInvalidationBatch {
  networkId: number;
  owner: Address;
  nonces: bigint[];
  wordPosMap: Map<bigint, bigint>; // wordPos -> bitmap
}

function nonceBitmap(nonce: bigint): { wordPos: bigint; bitPos: bigint } {
  const wordPos = nonce >> 8n;
  const bitPos = nonce & 0xffn;
  return { wordPos, bitPos };
}

function groupNoncesForInvalidation(nonces: bigint[]): Map<bigint, bigint> {
  const wordPosMap = new Map<bigint, bigint>();

  for (const nonce of nonces) {
    const { wordPos, bitPos } = nonceBitmap(nonce);
    const currentBitmap = wordPosMap.get(wordPos) || 0n;
    wordPosMap.set(wordPos, currentBitmap | (1n << bitPos));
  }

  return wordPosMap;
}

async function fetchClaimedPermits(supabase: ReturnType<typeof createClient<Database>>): Promise<ClaimedPermit[]> {
  console.log("Fetching claimed permits from database...");

  const { data, error } = await supabase
    .from("permits")
    .select(
      `
      nonce,
      signature,
      transaction,
      tokens!inner(
        network,
        address
      ),
      partners!inner(
        wallets!inner(
          address
        )
      )
    `
    )
    .not("transaction", "is", null);

  if (error) {
    throw new Error(`Failed to fetch claimed permits: ${error.message}`);
  }

  if (!data) {
    return [];
  }

  // Transform the nested data structure to flat ClaimedPermit objects
  return data.map((permit: any) => ({
    nonce: permit.nonce,
    network: permit.tokens.network,
    owner: permit.partners.wallets.address,
    signature: permit.signature,
    transaction: permit.transaction,
  }));
}

async function checkNonceStatus(publicClient: ReturnType<typeof createPublicClient>, owner: Address, nonce: bigint): Promise<boolean> {
  const { wordPos, bitPos } = nonceBitmap(nonce);

  try {
    const result = (await publicClient.readContract({
      address: PERMIT3_ADDRESS,
      abi: permit3Abi,
      functionName: "nonceBitmap",
      args: [owner, wordPos],
    })) as bigint;

    return (result & (1n << bitPos)) !== 0n;
  } catch (error) {
    console.error(`Failed to check nonce status for ${nonce}:`, error);
    return false;
  }
}

async function invalidateNonceBatch(
  walletClient: ReturnType<typeof createWalletClient>,
  publicClient: ReturnType<typeof createPublicClient>,
  batch: NonceInvalidationBatch
): Promise<{ success: boolean; txHashes: string[] }> {
  const txHashes: string[] = [];

  console.log(`Invalidating ${batch.nonces.length} nonces for owner ${batch.owner} on network ${batch.networkId}`);

  for (const [wordPos, bitmap] of batch.wordPosMap.entries()) {
    try {
      console.log(`  Invalidating word position ${wordPos} with bitmap ${bitmap.toString(2)}`);

      const { request } = await publicClient.simulateContract({
        address: PERMIT3_ADDRESS,
        abi: permit3Abi,
        functionName: "invalidateUnorderedNonces",
        args: [wordPos, bitmap],
        account: walletClient.account!.address,
      });

      const txHash = await walletClient.writeContract(request);
      console.log(`  Transaction sent: ${txHash}`);

      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
      console.log(`  Transaction confirmed in block ${receipt.blockNumber}`);

      txHashes.push(txHash);
    } catch (error) {
      console.error(`  Failed to invalidate word position ${wordPos}:`, error);
      return { success: false, txHashes };
    }
  }

  return { success: true, txHashes };
}

async function main() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const privateKey = process.env.MIGRATION_PRIVATE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set");
  }

  if (!privateKey) {
    throw new Error("MIGRATION_PRIVATE_KEY must be set (hex string starting with 0x)");
  }

  const account = privateKeyToAccount(privateKey as `0x${string}`);
  console.log(`Using migration account: ${account.address}`);

  const supabase = createClient<Database>(supabaseUrl, supabaseKey);

  const claimedPermits = await fetchClaimedPermits(supabase);
  console.log(`Found ${claimedPermits.length} claimed permits`);

  const permitsByNetworkAndOwner = new Map<string, NonceInvalidationBatch>();

  for (const permit of claimedPermits) {
    const key = `${permit.network}-${permit.owner.toLowerCase()}`;

    if (!permitsByNetworkAndOwner.has(key)) {
      permitsByNetworkAndOwner.set(key, {
        networkId: permit.network,
        owner: permit.owner as Address,
        nonces: [],
        wordPosMap: new Map(),
      });
    }

    const batch = permitsByNetworkAndOwner.get(key)!;
    batch.nonces.push(BigInt(permit.nonce));
  }

  for (const batch of permitsByNetworkAndOwner.values()) {
    batch.wordPosMap = groupNoncesForInvalidation(batch.nonces);
  }

  console.log(`\nGrouped into ${permitsByNetworkAndOwner.size} batches`);

  const results: Array<{
    networkId: number;
    owner: string;
    noncesToInvalidate: bigint[];
    success: boolean;
    txHashes: string[];
  }> = [];

  for (const batch of permitsByNetworkAndOwner.values()) {
    const chainConfig = CHAIN_CONFIGS[batch.networkId];

    if (!chainConfig) {
      console.warn(`Skipping unsupported network ${batch.networkId}`);
      continue;
    }

    console.log(`\nProcessing network ${batch.networkId} (${chainConfig.chain.name})`);

    const publicClient = createPublicClient({
      chain: chainConfig.chain,
      transport: http(chainConfig.rpcUrl),
    });

    const walletClient = createWalletClient({
      account,
      chain: chainConfig.chain,
      transport: http(chainConfig.rpcUrl),
    });

    const noncesToInvalidate: bigint[] = [];

    for (const nonce of batch.nonces) {
      const isUsed = await checkNonceStatus(publicClient, batch.owner, nonce);

      if (!isUsed) {
        console.log(`  Nonce ${nonce} is not yet used, will invalidate`);
        noncesToInvalidate.push(nonce);
      } else {
        console.log(`  Nonce ${nonce} is already used, skipping`);
      }
    }

    if (noncesToInvalidate.length === 0) {
      console.log(`  No nonces to invalidate for owner ${batch.owner}`);
      continue;
    }

    const invalidationBatch: NonceInvalidationBatch = {
      networkId: batch.networkId,
      owner: batch.owner,
      nonces: noncesToInvalidate,
      wordPosMap: groupNoncesForInvalidation(noncesToInvalidate),
    };

    const result = await invalidateNonceBatch(walletClient, publicClient, invalidationBatch);

    results.push({
      networkId: batch.networkId,
      owner: batch.owner,
      noncesToInvalidate,
      success: result.success,
      txHashes: result.txHashes,
    });
  }

  console.log("\n=== Migration Summary ===");
  console.log(`Total batches processed: ${results.length}`);

  const successful = results.filter((r) => r.success);
  const failed = results.filter((r) => !r.success);

  console.log(`Successful: ${successful.length}`);
  console.log(`Failed: ${failed.length}`);

  if (successful.length > 0) {
    console.log("\nSuccessful invalidations:");
    for (const result of successful) {
      console.log(`  - Network ${result.networkId}, Owner ${result.owner}`);
      console.log(`    Invalidated ${result.noncesToInvalidate.length} nonces`);
      console.log(`    Transactions: ${result.txHashes.join(", ")}`);
    }
  }

  if (failed.length > 0) {
    console.log("\nFailed invalidations:");
    for (const result of failed) {
      console.log(`  - Network ${result.networkId}, Owner ${result.owner}`);
      console.log(`    Failed to invalidate ${result.noncesToInvalidate.length} nonces`);
    }
  }

  const migrationReport = {
    timestamp: new Date().toISOString(),
    totalClaimedPermits: claimedPermits.length,
    totalBatches: results.length,
    successful: successful.map((r) => ({
      networkId: r.networkId,
      owner: r.owner,
      noncesInvalidated: r.noncesToInvalidate.map((n) => n.toString()),
      txHashes: r.txHashes,
    })),
    failed: failed.map((r) => ({
      networkId: r.networkId,
      owner: r.owner,
      noncesToInvalidate: r.noncesToInvalidate.map((n) => n.toString()),
    })),
  };

  const reportPath = `./migration-report-${Date.now()}.json`;
  await Bun.write(reportPath, JSON.stringify(migrationReport, null, 2));
  console.log(`\nMigration report saved to ${reportPath}`);
}

main().catch(console.error);
