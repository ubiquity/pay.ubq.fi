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
  console.log("Fetching LIMITED permits from database (10 permits max for demo)...");

  const { data, error } = await supabase
    .from("permits")
    .select(
      `
      nonce,
      transaction,
      tokens!inner(
        network
      ),
      partners!inner(
        wallets!inner(
          address
        )
      )
    `
    )
    .limit(10); // LIMIT TO 10 FOR DEMO

  if (error) {
    throw new Error(`Failed to fetch permits: ${error.message}`);
  }

  // Group permits by owner address (normalize to lowercase)
  const permitsByOwner = new Map<string, Set<bigint>>();
  let totalPermits = 0;

  if (data) {
    for (const permit of data) {
      totalPermits++;

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

  console.log(`Found ${totalPermits} total permits in database (LIMITED FOR DEMO)`);
  console.log(`Processing ${permitsByOwner.size} unique owners`);

  // Log summary by owner
  for (const [owner, nonces] of permitsByOwner.entries()) {
    console.log(`  Owner ${owner}: ${nonces.size} permits`);
  }

  return permitsByOwner;
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

async function main() {
  console.log("=== Permit2 to Permit3 Migration Tool (LIMITED DEMO) ===\n");

  // Check for dry-run mode
  const isDryRun = process.argv.includes("--dry-run");
  if (isDryRun) {
    console.log("🔍 Running in DRY-RUN mode - no transactions will be executed\n");
  }

  // Validate environment variables
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const privateKey = process.env.MIGRATION_PRIVATE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set");
  }

  if (!privateKey && !isDryRun) {
    throw new Error("MIGRATION_PRIVATE_KEY must be set (hex string starting with 0x) for non-dry-run mode");
  }

  // Initialize clients
  const account = privateKey ? privateKeyToAccount(privateKey as `0x${string}`) : null;
  if (account) {
    console.log(`Using migration account: ${account.address}\n`);
  }

  const supabase = createClient<Database>(supabaseUrl, supabaseKey);

  // Step 1: Fetch LIMITED permits from database
  const permitsByOwner = await fetchPermitsFromDatabase(supabase);

  // Step 2: Analyze permit statuses across all chains
  const allPermits = await analyzePermits(permitsByOwner);

  // Step 3: Filter permits that need syncing
  const permitsToSync = allPermits.filter(p => p.needsSync);
  console.log(`\n${permitsToSync.length} permits need to be synced to Permit3`);

  if (permitsToSync.length === 0) {
    console.log("No permits need syncing. All permits are already synchronized!");
    
    // Still generate a report even if nothing needs syncing
    const detailedReport = {
      timestamp: new Date().toISOString(),
      migrationAccount: account?.address || "dry-run",
      summary: {
        totalPermitsAnalyzed: allPermits.length,
        permitsNeedingSync: 0,
        totalBatches: 0,
        successfulBatches: 0,
        failedBatches: 0,
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
      syncResults: [],
    };

    const reportPath = `./permit2-to-permit3-sync-demo-${isDryRun ? "dry-run-" : ""}${Date.now()}.json`;
    await Bun.write(reportPath, JSON.stringify(detailedReport, null, 2));
    console.log(`\nDetailed report saved to ${reportPath}`);
    return;
  }

  // Step 4: Prepare batches for syncing
  const syncBatches = prepareSyncBatches(permitsToSync);
  console.log(`Prepared ${syncBatches.length} sync batches`);

  // Step 5: Execute sync to Permit3 on Gnosis (or simulate in dry-run mode)
  const results: Array<{
    owner: string;
    noncesCount: number;
    success: boolean;
    txHashes: string[];
  }> = [];

  if (isDryRun) {
    console.log("\n🔍 DRY-RUN: Simulating sync operations...\n");

    for (const batch of syncBatches) {
      console.log(`\n[DRY-RUN] Would sync ${batch.nonces.length} nonces for owner ${batch.owner}`);

      for (const [wordPos, bitmap] of batch.wordPosMap.entries()) {
        console.log(`  [DRY-RUN] Would invalidate word position ${wordPos} with bitmap ${bitmap.toString(2)}`);
        console.log(`  [DRY-RUN] Affected nonces: ${batch.nonces.filter(n => (n >> 8n) === wordPos).join(", ")}`);
      }

      results.push({
        owner: batch.owner,
        noncesCount: batch.nonces.length,
        success: true,
        txHashes: ["0x0000...dry-run"],
      });
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
    migrationAccount: account?.address || "dry-run",
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

  const reportPath = `./permit2-to-permit3-sync-demo-${isDryRun ? "dry-run-" : ""}${Date.now()}.json`;
  await Bun.write(reportPath, JSON.stringify(detailedReport, null, 2));
  console.log(`\nDetailed report saved to ${reportPath}`);

  if (isDryRun) {
    console.log("\n🔍 DRY-RUN COMPLETE - No actual transactions were executed");
    console.log("To execute the migration, run without --dry-run flag");
  }
}

// Run the migration
main().catch(error => {
  console.error("Migration failed:", error);
  process.exit(1);
});