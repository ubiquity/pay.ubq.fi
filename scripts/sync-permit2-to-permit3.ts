#!/usr/bin/env bun
import { createClient } from "@supabase/supabase-js";
import { createPublicClient, createWalletClient, http, type Address, type Chain, parseAbi, type Log } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { mainnet, gnosis } from "viem/chains";
import permit3Abi from "../src/frontend/src/fixtures/permit3-abi.json";
import type { Database } from "../src/frontend/src/database.types";

// Configuration
const RPC_URL = process.env.RPC_URL || "https://rpc.ubq.fi";

// Chain configurations
const CHAIN_CONFIGS: Record<number, { chain: Chain; rpcUrl: string }> = {
  1: { chain: mainnet, rpcUrl: `${RPC_URL}/1` },
  100: { chain: gnosis, rpcUrl: `${RPC_URL}/100` },
};

// Permit2 ABI (simplified for reading nonce bitmap)
const permit2Abi = parseAbi([
  "function nonceBitmap(address owner, uint256 wordPos) view returns (uint256)",
  "event UnorderedNonceInvalidation(address indexed owner, uint256 word, uint256 mask)",
]);

// Contract addresses
const PERMIT2_ADDRESS = "0x000000000022D473030F116dDEE9F6B43aC78BA3" as Address; // Standard Permit2 address
const PERMIT3_ADDRESS = "0xd635918A75356D133d5840eE5c9ED070302C9C60" as Address; // Permit3 on Gnosis

interface PermitData {
  owner: Address;
  nonce: bigint;
  wordPos: bigint;
  bitPos: bigint;
  isUsedOnPermit2Mainnet: boolean;
  isUsedOnPermit2Gnosis: boolean;
  isUsedOnPermit3Gnosis: boolean;
  needsSync: boolean;
}

interface SyncBatch {
  owner: Address;
  wordPosMap: Map<bigint, bigint>; // wordPos -> bitmap
  nonces: bigint[];
}

// Helper functions
function nonceBitmap(nonce: bigint): { wordPos: bigint; bitPos: bigint } {
  const wordPos = nonce >> 8n;
  const bitPos = nonce & 0xffn;
  return { wordPos, bitPos };
}

async function checkNonceStatusOnPermit2(
  publicClient: ReturnType<typeof createPublicClient>,
  owner: Address,
  nonce: bigint
): Promise<boolean> {
  const { wordPos, bitPos } = nonceBitmap(nonce);

  try {
    const result = (await publicClient.readContract({
      address: PERMIT2_ADDRESS,
      abi: permit2Abi,
      functionName: "nonceBitmap",
      args: [owner, wordPos],
    })) as bigint;

    return (result & (1n << bitPos)) !== 0n;
  } catch (error) {
    console.error(`Failed to check Permit2 nonce status for ${nonce}:`, error);
    return false;
  }
}

async function checkNonceStatusOnPermit3(
  publicClient: ReturnType<typeof createPublicClient>,
  owner: Address,
  nonce: bigint
): Promise<boolean> {
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
    console.error(`Failed to check Permit3 nonce status for ${nonce}:`, error);
    return false;
  }
}

async function fetchPermitsFromDatabase(
  supabase: ReturnType<typeof createClient<Database>>
): Promise<Map<string, Set<bigint>>> {
  console.log("Fetching permits from database...");

  const { data, error } = await supabase
    .from("permits")
    .select(
      `
      nonce,
      tokens!inner(
        network
      ),
      partners!inner(
        wallets!inner(
          address
        )
      )
    `
    );

  if (error) {
    throw new Error(`Failed to fetch permits: ${error.message}`);
  }

  // Group permits by owner address (normalize to lowercase)
  const permitsByOwner = new Map<string, Set<bigint>>();

  if (data) {
    for (const permit of data) {
      const owner = (permit.partners?.wallets?.address || "").toLowerCase();
      const network = permit.tokens?.network;

      // Only process permits from mainnet (1) and Gnosis (100)
      if (owner && (network === 1 || network === 100)) {
        if (!permitsByOwner.has(owner)) {
          permitsByOwner.set(owner, new Set());
        }
        permitsByOwner.get(owner)!.add(BigInt(permit.nonce));
      }
    }
  }

  console.log(`Found ${permitsByOwner.size} unique owners with permits`);
  return permitsByOwner;
}

async function scanPermit2Events(
  chainId: number,
  fromBlock: bigint,
  toBlock: bigint
): Promise<Map<string, Set<bigint>>> {
  const config = CHAIN_CONFIGS[chainId];
  if (!config) {
    throw new Error(`Unsupported chain: ${chainId}`);
  }

  console.log(`Scanning Permit2 events on ${config.chain.name} from block ${fromBlock} to ${toBlock}...`);

  const publicClient = createPublicClient({
    chain: config.chain,
    transport: http(config.rpcUrl),
  });

  const usedNoncesByOwner = new Map<string, Set<bigint>>();

  try {
    // Fetch UnorderedNonceInvalidation events
    const logs = await publicClient.getLogs({
      address: PERMIT2_ADDRESS,
      event: {
        type: "event",
        name: "UnorderedNonceInvalidation",
        inputs: [
          { indexed: true, name: "owner", type: "address" },
          { indexed: false, name: "word", type: "uint256" },
          { indexed: false, name: "mask", type: "uint256" },
        ],
      },
      fromBlock,
      toBlock,
    });

    // Process logs to extract used nonces
    for (const log of logs) {
      const owner = (log.args.owner as string).toLowerCase();
      const wordPos = log.args.word as bigint;
      const mask = log.args.mask as bigint;

      if (!usedNoncesByOwner.has(owner)) {
        usedNoncesByOwner.set(owner, new Set());
      }

      // Convert bitmap mask to individual nonces
      for (let bitPos = 0n; bitPos < 256n; bitPos++) {
        if ((mask & (1n << bitPos)) !== 0n) {
          const nonce = (wordPos << 8n) | bitPos;
          usedNoncesByOwner.get(owner)!.add(nonce);
        }
      }
    }

    console.log(`Found ${usedNoncesByOwner.size} owners with used nonces on ${config.chain.name}`);
  } catch (error) {
    console.error(`Error scanning events on ${config.chain.name}:`, error);
  }

  return usedNoncesByOwner;
}

async function analyzePermits(
  permitsByOwner: Map<string, Set<bigint>>
): Promise<PermitData[]> {
  console.log("\nAnalyzing permit statuses across chains...");

  const mainnetClient = createPublicClient({
    chain: mainnet,
    transport: http(CHAIN_CONFIGS[1].rpcUrl),
  });

  const gnosisClient = createPublicClient({
    chain: gnosis,
    transport: http(CHAIN_CONFIGS[100].rpcUrl),
  });

  const allPermits: PermitData[] = [];

  for (const [owner, nonces] of permitsByOwner.entries()) {
    console.log(`\nChecking ${nonces.size} permits for owner ${owner}`);

    for (const nonce of nonces) {
      const { wordPos, bitPos } = nonceBitmap(nonce);

      // Check status on all three contracts
      const [isUsedOnPermit2Mainnet, isUsedOnPermit2Gnosis, isUsedOnPermit3Gnosis] = await Promise.all([
        checkNonceStatusOnPermit2(mainnetClient, owner as Address, nonce),
        checkNonceStatusOnPermit2(gnosisClient, owner as Address, nonce),
        checkNonceStatusOnPermit3(gnosisClient, owner as Address, nonce),
      ]);

      const permitData: PermitData = {
        owner: owner as Address,
        nonce,
        wordPos,
        bitPos,
        isUsedOnPermit2Mainnet,
        isUsedOnPermit2Gnosis,
        isUsedOnPermit3Gnosis,
        needsSync: (isUsedOnPermit2Mainnet || isUsedOnPermit2Gnosis) && !isUsedOnPermit3Gnosis,
      };

      allPermits.push(permitData);

      if (permitData.needsSync) {
        console.log(`  Nonce ${nonce} needs sync (Used on Permit2: Mainnet=${isUsedOnPermit2Mainnet}, Gnosis=${isUsedOnPermit2Gnosis}, Not on Permit3)`);
      }
    }
  }

  return allPermits;
}

function prepareSyncBatches(permits: PermitData[]): SyncBatch[] {
  const batchesByOwner = new Map<string, SyncBatch>();

  for (const permit of permits) {
    if (!permit.needsSync) continue;

    const ownerKey = permit.owner.toLowerCase();

    if (!batchesByOwner.has(ownerKey)) {
      batchesByOwner.set(ownerKey, {
        owner: permit.owner,
        wordPosMap: new Map(),
        nonces: [],
      });
    }

    const batch = batchesByOwner.get(ownerKey)!;
    batch.nonces.push(permit.nonce);

    // Update bitmap for this word position
    const currentBitmap = batch.wordPosMap.get(permit.wordPos) || 0n;
    batch.wordPosMap.set(permit.wordPos, currentBitmap | (1n << permit.bitPos));
  }

  return Array.from(batchesByOwner.values());
}

async function syncToPermit3(
  batch: SyncBatch,
  walletClient: ReturnType<typeof createWalletClient>,
  publicClient: ReturnType<typeof createPublicClient>
): Promise<{ success: boolean; txHashes: string[] }> {
  const txHashes: string[] = [];

  console.log(`\nSyncing ${batch.nonces.length} nonces for owner ${batch.owner} to Permit3...`);

  for (const [wordPos, bitmap] of batch.wordPosMap.entries()) {
    try {
      console.log(`  Invalidating word position ${wordPos} with bitmap ${bitmap.toString(2)}`);

      // Simulate the transaction first
      const { request } = await publicClient.simulateContract({
        address: PERMIT3_ADDRESS,
        abi: permit3Abi,
        functionName: "invalidateUnorderedNonces",
        args: [wordPos, bitmap],
        account: walletClient.account!.address,
      });

      // Execute the transaction
      const txHash = await walletClient.writeContract(request);
      console.log(`  Transaction sent: ${txHash}`);

      // Wait for confirmation
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
  console.log("=== Permit2 to Permit3 Migration Tool ===\n");

  // Validate environment variables
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const privateKey = process.env.MIGRATION_PRIVATE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set");
  }

  if (!privateKey) {
    throw new Error("MIGRATION_PRIVATE_KEY must be set (hex string starting with 0x)");
  }

  // Initialize clients
  const account = privateKeyToAccount(privateKey as `0x${string}`);
  console.log(`Using migration account: ${account.address}\n`);

  const supabase = createClient<Database>(supabaseUrl, supabaseKey);

  // Step 1: Fetch all permits from database
  const permitsByOwner = await fetchPermitsFromDatabase(supabase);

  // Step 2: Analyze permit statuses across all chains
  const allPermits = await analyzePermits(permitsByOwner);

  // Step 3: Filter permits that need syncing
  const permitsToSync = allPermits.filter(p => p.needsSync);
  console.log(`\n${permitsToSync.length} permits need to be synced to Permit3`);

  if (permitsToSync.length === 0) {
    console.log("No permits need syncing. All permits are already synchronized!");
    return;
  }

  // Step 4: Prepare batches for syncing
  const syncBatches = prepareSyncBatches(permitsToSync);
  console.log(`Prepared ${syncBatches.length} sync batches`);

  // Step 5: Execute sync to Permit3 on Gnosis
  const gnosisWalletClient = createWalletClient({
    account,
    chain: gnosis,
    transport: http(CHAIN_CONFIGS[100].rpcUrl),
  });

  const gnosisPublicClient = createPublicClient({
    chain: gnosis,
    transport: http(CHAIN_CONFIGS[100].rpcUrl),
  });

  const results: Array<{
    owner: string;
    noncesCount: number;
    success: boolean;
    txHashes: string[];
  }> = [];

  for (const batch of syncBatches) {
    const result = await syncToPermit3(batch, gnosisWalletClient, gnosisPublicClient);

    results.push({
      owner: batch.owner,
      noncesCount: batch.nonces.length,
      success: result.success,
      txHashes: result.txHashes,
    });

    // Add delay between batches to avoid rate limiting
    if (syncBatches.indexOf(batch) < syncBatches.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  // Step 6: Generate report
  console.log("\n=== Migration Summary ===");

  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);

  console.log(`Total batches processed: ${results.length}`);
  console.log(`Successful: ${successful.length}`);
  console.log(`Failed: ${failed.length}`);

  if (successful.length > 0) {
    console.log("\nSuccessful syncs:");
    for (const result of successful) {
      console.log(`  - Owner ${result.owner}`);
      console.log(`    Synced ${result.noncesCount} nonces`);
      console.log(`    Transactions: ${result.txHashes.join(", ")}`);
    }
  }

  if (failed.length > 0) {
    console.log("\nFailed syncs:");
    for (const result of failed) {
      console.log(`  - Owner ${result.owner}`);
      console.log(`    Failed to sync ${result.noncesCount} nonces`);
      if (result.txHashes.length > 0) {
        console.log(`    Partial transactions: ${result.txHashes.join(", ")}`);
      }
    }
  }

  // Save detailed report
  const detailedReport = {
    timestamp: new Date().toISOString(),
    migrationAccount: account.address,
    summary: {
      totalPermitsAnalyzed: allPermits.length,
      permitsNeedingSync: permitsToSync.length,
      totalBatches: results.length,
      successfulBatches: successful.length,
      failedBatches: failed.length,
    },
    permitAnalysis: allPermits.map(p => ({
      owner: p.owner,
      nonce: p.nonce.toString(),
      wordPos: p.wordPos.toString(),
      bitPos: p.bitPos.toString(),
      permit2Mainnet: p.isUsedOnPermit2Mainnet,
      permit2Gnosis: p.isUsedOnPermit2Gnosis,
      permit3Gnosis: p.isUsedOnPermit3Gnosis,
      needsSync: p.needsSync,
    })),
    syncResults: results.map(r => ({
      owner: r.owner,
      noncesCount: r.noncesCount,
      success: r.success,
      txHashes: r.txHashes,
    })),
  };

  const reportPath = `./permit2-to-permit3-sync-${Date.now()}.json`;
  await Bun.write(reportPath, JSON.stringify(detailedReport, null, 2));
  console.log(`\nDetailed report saved to ${reportPath}`);
}

// Run the migration
main().catch(error => {
  console.error("Migration failed:", error);
  process.exit(1);
});
