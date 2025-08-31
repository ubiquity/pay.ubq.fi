#!/usr/bin/env bun
import { createClient } from "@supabase/supabase-js";
import { createPublicClient, createWalletClient, http, type Address, type Chain, parseAbi } from "viem";
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
  isUsedOnPermit3GnosisAfterMigration?: boolean;
  needsSync: boolean;
  permitId?: string; // Add permit ID for tracking
  transaction?: string | null; // Add transaction for identifying claimed permits
}

interface SyncBatch {
  owner: Address;
  wordPosMap: Map<bigint, bigint>; // wordPos -> bitmap
  nonces: bigint[];
}

interface DoubleClaimAlert {
  permitId: string;
  owner: Address;
  nonce: bigint;
  originalClaim: string | null;
  detectedAt: string;
  wordPos: bigint;
  bitPos: bigint;
}

// Helper functions
function nonceBitmap(nonce: bigint): { wordPos: bigint; bitPos: bigint } {
  const wordPos = nonce >> 8n;
  const bitPos = nonce & 0xffn;
  return { wordPos, bitPos };
}

// Batch RPC request helper
async function batchRpcCall(rpcUrl: string, requests: any[]): Promise<any[]> {
  const response = await fetch(rpcUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(requests),
  });

  if (!response.ok) {
    throw new Error(`RPC request failed: ${response.statusText}`);
  }

  const results = await response.json();
  
  // Check for errors in individual responses
  return results.map((result: any, index: number) => {
    if (result.error) {
      console.error(`RPC error in request ${index}:`, result.error);
      return null;
    }
    return result.result;
  });
}

// Batch check nonce statuses using JSON RPC batch requests
async function batchCheckNonceStatuses(
  rpcUrl: string,
  contractAddress: Address,
  ownerNoncePairs: Array<{ owner: Address; nonce: bigint }>
): Promise<Map<string, boolean>> {
  console.log(`Batch checking ${ownerNoncePairs.length} nonces on ${contractAddress}...`);
  
  const results = new Map<string, boolean>();
  const batchSize = 50; // Process in batches of 50 to avoid rate limiting
  
  // Process in chunks
  for (let i = 0; i < ownerNoncePairs.length; i += batchSize) {
    const chunk = ownerNoncePairs.slice(i, Math.min(i + batchSize, ownerNoncePairs.length));
    
    // Prepare batch RPC requests
    const requests = chunk.map((pair, index) => {
      const { wordPos } = nonceBitmap(pair.nonce);
      
      // Encode the function call
      const functionData = `0x4fe02b44${pair.owner.slice(2).padStart(64, "0")}${wordPos.toString(16).padStart(64, "0")}`;
      
      return {
        jsonrpc: "2.0",
        id: i + index + 1,
        method: "eth_call",
        params: [
          {
            to: contractAddress,
            data: functionData,
          },
          "latest",
        ],
      };
    });
    
    try {
      const batchResults = await batchRpcCall(rpcUrl, requests);
      
      // Process results
      chunk.forEach((pair, index) => {
        const result = batchResults[index];
        if (result) {
          const { bitPos } = nonceBitmap(pair.nonce);
          const bitmap = BigInt(result);
          const isUsed = (bitmap & (1n << bitPos)) !== 0n;
          const key = `${pair.owner.toLowerCase()}_${pair.nonce}`;
          results.set(key, isUsed);
        } else {
          // Default to false if there was an error
          const key = `${pair.owner.toLowerCase()}_${pair.nonce}`;
          results.set(key, false);
        }
      });
    } catch (error) {
      console.error(`Batch RPC call failed for chunk ${i / batchSize + 1}:`, error);
      // Set all in this chunk to false on error
      chunk.forEach(pair => {
        const key = `${pair.owner.toLowerCase()}_${pair.nonce}`;
        results.set(key, false);
      });
    }
    
    // Small delay between batches to avoid rate limiting
    if (i + batchSize < ownerNoncePairs.length) {
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  }
  
  return results;
}

async function fetchPermitsFromDatabase(
  supabase: ReturnType<typeof createClient<Database>>
): Promise<{ permits: Map<string, Set<bigint>>; permitDetails: Map<string, PermitData> }> {
  console.log("Fetching all permits from database...");

  const { data, error } = await supabase
    .from("permits")
    .select(
      `
      id,
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
    );

  if (error) {
    throw new Error(`Failed to fetch permits: ${error.message}`);
  }

  // Group permits by owner address (normalize to lowercase)
  const permitsByOwner = new Map<string, Set<bigint>>();
  const permitDetails = new Map<string, PermitData>();
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
        const nonce = BigInt(permit.nonce);
        permitsByOwner.get(owner)!.add(nonce);
        
        // Store permit details for double-claim detection
        const { wordPos, bitPos } = nonceBitmap(nonce);
        const key = `${owner}_${nonce}`;
        permitDetails.set(key, {
          owner: owner as Address,
          nonce,
          wordPos,
          bitPos,
          isUsedOnPermit2Mainnet: false,
          isUsedOnPermit2Gnosis: false,
          isUsedOnPermit3Gnosis: false,
          needsSync: false,
          permitId: permit.id,
          transaction: permit.transaction,
        });
      }
    }
  }

  console.log(`Found ${totalPermits} total permits in database`);
  console.log(`Processing ${permitsByOwner.size} unique owners`);

  // Log summary by owner
  for (const [owner, nonces] of permitsByOwner.entries()) {
    console.log(`  Owner ${owner}: ${nonces.size} permits`);
  }

  return { permits: permitsByOwner, permitDetails };
}

async function analyzePermitsWithBatch(
  permitsByOwner: Map<string, Set<bigint>>,
  permitDetails: Map<string, PermitData>
): Promise<PermitData[]> {
  console.log("\nAnalyzing permit statuses across chains using batch RPC...");

  // Prepare all owner-nonce pairs
  const allPairs: Array<{ owner: Address; nonce: bigint }> = [];
  for (const [owner, nonces] of permitsByOwner.entries()) {
    for (const nonce of nonces) {
      allPairs.push({ owner: owner as Address, nonce });
    }
  }

  // Batch check on all three contracts
  const [mainnetPermit2Results, gnosisPermit2Results, gnosisPermit3Results] = await Promise.all([
    batchCheckNonceStatuses(CHAIN_CONFIGS[1].rpcUrl, PERMIT2_ADDRESS, allPairs),
    batchCheckNonceStatuses(CHAIN_CONFIGS[100].rpcUrl, PERMIT2_ADDRESS, allPairs),
    batchCheckNonceStatuses(CHAIN_CONFIGS[100].rpcUrl, PERMIT3_ADDRESS, allPairs),
  ]);

  // Update permit details with results
  const allPermits: PermitData[] = [];
  
  for (const [owner, nonces] of permitsByOwner.entries()) {
    console.log(`\nProcessing ${nonces.size} permits for owner ${owner}`);

    for (const nonce of nonces) {
      const key = `${owner.toLowerCase()}_${nonce}`;
      const permitData = permitDetails.get(key)!;
      
      // Get results from batch checks
      permitData.isUsedOnPermit2Mainnet = mainnetPermit2Results.get(key) || false;
      permitData.isUsedOnPermit2Gnosis = gnosisPermit2Results.get(key) || false;
      permitData.isUsedOnPermit3Gnosis = gnosisPermit3Results.get(key) || false;
      permitData.needsSync = (permitData.isUsedOnPermit2Mainnet || permitData.isUsedOnPermit2Gnosis) && !permitData.isUsedOnPermit3Gnosis;

      allPermits.push(permitData);

      if (permitData.needsSync) {
        console.log(`  Nonce ${nonce} needs sync (Used on Permit2: Mainnet=${permitData.isUsedOnPermit2Mainnet}, Gnosis=${permitData.isUsedOnPermit2Gnosis}, Not on Permit3)`);
      }
    }
  }

  return allPermits;
}

async function checkForDoubleClaims(
  permits: PermitData[],
  isDryRun: boolean
): Promise<DoubleClaimAlert[]> {
  console.log("\n=== Checking for Double Claims After Migration ===");
  
  const doubleClaimAlerts: DoubleClaimAlert[] = [];
  const claimedPermits = permits.filter(p => p.transaction !== null && p.transaction !== undefined);
  
  if (claimedPermits.length === 0) {
    console.log("No claimed permits found in the dataset.");
    return doubleClaimAlerts;
  }
  
  console.log(`Checking ${claimedPermits.length} previously claimed permits for double-claim attempts...`);
  
  // Prepare pairs for batch checking
  const claimedPairs = claimedPermits.map(p => ({ owner: p.owner, nonce: p.nonce }));
  
  // Batch check current status on Permit3
  const permit3StatusAfterMigration = await batchCheckNonceStatuses(
    CHAIN_CONFIGS[100].rpcUrl,
    PERMIT3_ADDRESS,
    claimedPairs
  );
  
  // Check each claimed permit
  for (const permit of claimedPermits) {
    const key = `${permit.owner.toLowerCase()}_${permit.nonce}`;
    const isUsedOnPermit3Now = permit3StatusAfterMigration.get(key) || false;
    
    // If this permit was claimed (has transaction) and the nonce is now used on Permit3,
    // it indicates a potential double-claim situation
    if (isUsedOnPermit3Now && permit.transaction) {
      const alert: DoubleClaimAlert = {
        permitId: permit.permitId || "unknown",
        owner: permit.owner,
        nonce: permit.nonce,
        originalClaim: permit.transaction,
        detectedAt: new Date().toISOString(),
        wordPos: permit.wordPos,
        bitPos: permit.bitPos,
      };
      
      doubleClaimAlerts.push(alert);
      
      console.log(`\n⚠️  DOUBLE CLAIM ALERT ⚠️`);
      console.log(`  Permit ID: ${alert.permitId}`);
      console.log(`  Owner: ${alert.owner}`);
      console.log(`  Nonce: ${alert.nonce}`);
      console.log(`  Original claim TX: ${alert.originalClaim}`);
      console.log(`  Status: Nonce is now invalidated on Permit3`);
      console.log(`  Action Required: Investigate and potentially recover funds from double claimant`);
    }
  }
  
  if (doubleClaimAlerts.length === 0) {
    console.log("✅ No double claims detected!");
  } else {
    console.log(`\n❌ Found ${doubleClaimAlerts.length} potential double claim(s) that require investigation!`);
  }
  
  return doubleClaimAlerts;
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
  console.log("=== Permit2 to Permit3 Migration Tool (Optimized with Batch RPC) ===\n");

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

  // Step 1: Fetch all permits from database
  const { permits: permitsByOwner, permitDetails } = await fetchPermitsFromDatabase(supabase);

  // Step 2: Analyze permit statuses across all chains using batch RPC
  const allPermits = await analyzePermitsWithBatch(permitsByOwner, permitDetails);

  // Step 3: Filter permits that need syncing
  const permitsToSync = allPermits.filter(p => p.needsSync);
  console.log(`\n${permitsToSync.length} permits need to be synced to Permit3`);

  if (permitsToSync.length === 0) {
    console.log("No permits need syncing. All permits are already synchronized!");
    
    // Still check for double claims even if no syncing needed
    const doubleClaimAlerts = await checkForDoubleClaims(allPermits, isDryRun);
    
    if (doubleClaimAlerts.length > 0) {
      const alertReportPath = `./double-claim-alerts-${Date.now()}.json`;
      const alertsForSave = doubleClaimAlerts.map(alert => ({
        ...alert,
        nonce: alert.nonce.toString(),
        wordPos: alert.wordPos.toString(),
        bitPos: alert.bitPos.toString(),
      }));
      await Bun.write(alertReportPath, JSON.stringify(alertsForSave, null, 2));
      console.log(`\n⚠️  Double claim alerts saved to ${alertReportPath}`);
    }
    
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
  } else {
    const gnosisWalletClient = createWalletClient({
      account: account!,
      chain: gnosis,
      transport: http(CHAIN_CONFIGS[100].rpcUrl),
    });

    const gnosisPublicClient = createPublicClient({
      chain: gnosis,
      transport: http(CHAIN_CONFIGS[100].rpcUrl),
    });

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
  }

  // Step 6: Check for double claims after migration
  const doubleClaimAlerts = await checkForDoubleClaims(allPermits, isDryRun);

  // Step 7: Generate comprehensive report
  console.log("\n=== Migration Summary ===");

  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);

  console.log(`Total batches processed: ${results.length}`);
  console.log(`Successful: ${successful.length}`);
  console.log(`Failed: ${failed.length}`);
  console.log(`Double claim alerts: ${doubleClaimAlerts.length}`);

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
      doubleClaimAlerts: doubleClaimAlerts.length,
    },
    permitAnalysis: allPermits.map(p => ({
      owner: p.owner,
      nonce: p.nonce.toString(),
      wordPos: p.wordPos.toString(),
      bitPos: p.bitPos.toString(),
      permitId: p.permitId,
      transaction: p.transaction,
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
    doubleClaimAlerts: doubleClaimAlerts.map(alert => ({
      ...alert,
      nonce: alert.nonce.toString(),
      wordPos: alert.wordPos.toString(),
      bitPos: alert.bitPos.toString(),
    })),
  };

  const reportPath = `./permit2-to-permit3-sync-${isDryRun ? "dry-run-" : ""}${Date.now()}.json`;
  await Bun.write(reportPath, JSON.stringify(detailedReport, null, 2));
  console.log(`\nDetailed report saved to ${reportPath}`);

  // Save separate double claim alerts file if any were found
  if (doubleClaimAlerts.length > 0) {
    const alertReportPath = `./double-claim-alerts-${isDryRun ? "dry-run-" : ""}${Date.now()}.json`;
    const alertsForSave = doubleClaimAlerts.map(alert => ({
      ...alert,
      nonce: alert.nonce.toString(),
      wordPos: alert.wordPos.toString(),
      bitPos: alert.bitPos.toString(),
    }));
    await Bun.write(alertReportPath, JSON.stringify(alertsForSave, null, 2));
    console.log(`⚠️  Double claim alerts saved to ${alertReportPath}`);
    console.log("\n🚨 IMPORTANT: Review double claim alerts immediately!");
    console.log("   These permits may have been claimed twice and require fund recovery.");
  }

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