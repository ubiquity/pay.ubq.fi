#!/usr/bin/env bun
/**
 * Extract Nonces That Need Migration
 * 
 * This script analyzes your database and determines which nonces
 * need to be migrated from Permit2 to Permit3 on Gnosis chain.
 */

import { createClient } from "@supabase/supabase-js";
import { createPublicClient, http, type Address, parseAbi } from "viem";
import { gnosis, mainnet } from "viem/chains";
import type { Database } from "../../src/frontend/src/database.types";

// Contract addresses
const PERMIT2_ADDRESS = "0x000000000022D473030F116dDEE9F6B43aC78BA3" as Address;
const PERMIT3_ADDRESS = "0xd635918A75356D133d5840eE5c9ED070302C9C60" as Address;

// RPC Configuration
const RPC_URLS = {
  mainnet: process.env.MAINNET_RPC_URL || "https://rpc.ubq.fi/1",
  gnosis: process.env.GNOSIS_RPC_URL || "https://rpc.ubq.fi/100",
};

const permit2Abi = parseAbi([
  "function nonceBitmap(address owner, uint256 wordPos) view returns (uint256)",
]);

interface PermitData {
  owner: Address;
  nonce: bigint;
  permitId: string;
  isUsedOnPermit2Mainnet: boolean;
  isUsedOnPermit2Gnosis: boolean; 
  isUsedOnPermit3Gnosis: boolean;
  needsMigration: boolean;
}

function nonceBitmap(nonce: bigint): { wordPos: bigint; bitPos: bigint } {
  const wordPos = nonce >> 8n;
  const bitPos = nonce & 0xffn;
  return { wordPos, bitPos };
}


/**
 * Batch check multiple nonces for an owner
 */
async function batchCheckNonces(
  publicClient: ReturnType<typeof createPublicClient>,
  contractAddress: Address,
  owner: Address,
  nonces: bigint[]
): Promise<Map<bigint, boolean>> {
  const results = new Map<bigint, boolean>();
  
  // Group nonces by word position for efficient checking
  const wordPosMap = new Map<bigint, bigint[]>();
  for (const nonce of nonces) {
    const { wordPos } = nonceBitmap(nonce);
    if (!wordPosMap.has(wordPos)) {
      wordPosMap.set(wordPos, []);
    }
    wordPosMap.get(wordPos)!.push(nonce);
  }
  
  // Check each word position
  for (const [wordPos, wordNonces] of wordPosMap.entries()) {
    try {
      const bitmap = await publicClient.readContract({
        address: contractAddress,
        abi: permit2Abi,
        functionName: "nonceBitmap", 
        args: [owner, wordPos],
      });
      
      // Check each nonce in this word
      for (const nonce of wordNonces) {
        const { bitPos } = nonceBitmap(nonce);
        const isUsed = (bitmap & (1n << bitPos)) !== 0n;
        results.set(nonce, isUsed);
      }
    } catch (error) {
      console.warn(`Error checking word position ${wordPos} for ${owner}:`, error);
      // Mark all nonces in this word as not used if we can't check
      for (const nonce of wordNonces) {
        results.set(nonce, false);
      }
    }
  }
  
  return results;
}

/**
 * Fetch permits from database
 */
async function fetchPermitsFromDatabase(
  supabase: ReturnType<typeof createClient<Database>>
): Promise<Array<{ owner: Address; nonce: bigint; permitId: string }>> {
  console.log("📥 Fetching permits from database...");
  
  let allData: any[] = [];
  let start = 0;
  const pageSize = 1000;
  
  while (true) {
    const { data, error } = await supabase
      .from("permits")
      .select(`
        id,
        nonce,
        partners(
          wallets(
            address
          )
        ),
        tokens(
          network
        )
      `)
      .range(start, start + pageSize - 1)
      .order('id', { ascending: true });
    
    if (error) {
      throw new Error(`Failed to fetch permits: ${error.message}`);
    }
    
    if (!data || data.length === 0) break;
    
    allData.push(...data);
    console.log(`  📦 Fetched ${data.length} permits (total: ${allData.length})`);
    
    if (data.length < pageSize) break;
    start += pageSize;
  }
  
  // Filter and transform data
  const permits = allData
    .filter(p => p.nonce && p.partners?.wallets?.address)
    .filter(p => p.tokens?.network === 1 || p.tokens?.network === 100) // Only mainnet and Gnosis
    .map(p => ({
      owner: p.partners.wallets.address.toLowerCase() as Address,
      nonce: BigInt(p.nonce),
      permitId: p.id.toString(),
    }));
  
  console.log(`  ✅ Found ${permits.length} valid permits`);
  return permits;
}

/**
 * Main analysis function
 */
async function analyzeNonces() {
  console.log("🔍 Analyzing Nonces for Migration");
  console.log("=================================\n");
  
  // Validate environment
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  if (!supabaseUrl || !supabaseKey) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set");
  }
  
  // Initialize clients
  const supabase = createClient<Database>(supabaseUrl, supabaseKey);
  
  const mainnetClient = createPublicClient({
    chain: mainnet,
    transport: http(RPC_URLS.mainnet),
  });
  
  const gnosisClient = createPublicClient({
    chain: gnosis,
    transport: http(RPC_URLS.gnosis),
  });
  
  // Fetch permits
  const permits = await fetchPermitsFromDatabase(supabase);
  
  // Group by owner for efficient checking
  const permitsByOwner = new Map<Address, Array<{ nonce: bigint; permitId: string }>>();
  for (const permit of permits) {
    if (!permitsByOwner.has(permit.owner)) {
      permitsByOwner.set(permit.owner, []);
    }
    permitsByOwner.get(permit.owner)!.push({
      nonce: permit.nonce,
      permitId: permit.permitId,
    });
  }
  
  console.log(`\n🔄 Checking nonce status for ${permitsByOwner.size} owners...\n`);
  
  const allPermitData: PermitData[] = [];
  let ownerCount = 0;
  
  // Check each owner's nonces
  for (const [owner, ownerPermits] of permitsByOwner.entries()) {
    ownerCount++;
    const nonces = ownerPermits.map(p => p.nonce);
    
    console.log(`👤 ${ownerCount}/${permitsByOwner.size} - Checking ${nonces.length} nonces for ${owner}`);
    
    // Check all three contracts in parallel
    const [permit2Mainnet, permit2Gnosis, permit3Gnosis] = await Promise.all([
      batchCheckNonces(mainnetClient, PERMIT2_ADDRESS, owner, nonces),
      batchCheckNonces(gnosisClient, PERMIT2_ADDRESS, owner, nonces), 
      batchCheckNonces(gnosisClient, PERMIT3_ADDRESS, owner, nonces),
    ]);
    
    // Analyze results
    let needsMigrationCount = 0;
    for (const ownerPermit of ownerPermits) {
      const nonce = ownerPermit.nonce;
      const isUsedOnPermit2Mainnet = permit2Mainnet.get(nonce) || false;
      const isUsedOnPermit2Gnosis = permit2Gnosis.get(nonce) || false;
      const isUsedOnPermit3Gnosis = permit3Gnosis.get(nonce) || false;
      
      const needsMigration = (isUsedOnPermit2Mainnet || isUsedOnPermit2Gnosis) && !isUsedOnPermit3Gnosis;
      
      if (needsMigration) needsMigrationCount++;
      
      allPermitData.push({
        owner,
        nonce,
        permitId: ownerPermit.permitId,
        isUsedOnPermit2Mainnet,
        isUsedOnPermit2Gnosis,
        isUsedOnPermit3Gnosis,
        needsMigration,
      });
    }
    
    console.log(`  ✅ ${needsMigrationCount} nonces need migration`);
  }
  
  // Generate results
  const needsMigration = allPermitData.filter(p => p.needsMigration);
  const migrationNonces = needsMigration.map(p => p.nonce);
  
  console.log("\n" + "=".repeat(50));
  console.log("📊 ANALYSIS RESULTS");
  console.log("=".repeat(50));
  console.log(`Total permits analyzed: ${allPermitData.length}`);
  console.log(`Nonces needing migration: ${needsMigration.length}`);
  console.log(`Unique owners: ${permitsByOwner.size}`);
  
  if (migrationNonces.length === 0) {
    console.log("\n✅ No migration needed! All nonces are already synced.");
    return;
  }
  
  // Save detailed report
  const report = {
    timestamp: new Date().toISOString(),
    summary: {
      totalPermits: allPermitData.length,
      needsMigration: needsMigration.length,
      uniqueOwners: permitsByOwner.size,
    },
    migrationNonces: migrationNonces.map(n => n.toString()),
    detailedAnalysis: allPermitData.map(p => ({
      owner: p.owner,
      nonce: p.nonce.toString(),
      permitId: p.permitId,
      permit2Mainnet: p.isUsedOnPermit2Mainnet,
      permit2Gnosis: p.isUsedOnPermit2Gnosis,
      permit3Gnosis: p.isUsedOnPermit3Gnosis,
      needsMigration: p.needsMigration,
    })),
  };
  
  await Bun.write("migration-nonces-analysis.json", JSON.stringify(report, null, 2));
  console.log(`\n📄 Detailed report saved to migration-nonces-analysis.json`);
  
  // Generate the migration script template
  const scriptTemplate = `#!/usr/bin/env bun
// Generated migration nonces - ${new Date().toISOString()}
// Found ${migrationNonces.length} nonces that need migration

const migrationNonces = [
${migrationNonces.map(n => `  ${n}n,`).join('\n')}
];

// Import and run the migration
import { runMigration } from './simple-nonce-migration';

async function main() {
  const isDryRun = process.argv.includes('--dry-run');
  await runMigration(migrationNonces, isDryRun);
}

if (import.meta.main) {
  main().catch(console.error);
}
`;
  
  await Bun.write("scripts/run-migration.ts", scriptTemplate);
  console.log(`📝 Migration script generated: scripts/run-migration.ts`);
  
  console.log("\n🚀 Next steps:");
  console.log("1. Set your MIGRATION_PRIVATE_KEY environment variable");
  console.log("2. Test with dry-run: bun scripts/run-migration.ts --dry-run");
  console.log("3. Run migration: bun scripts/run-migration.ts");
  
  return migrationNonces;
}

if (import.meta.main) {
  analyzeNonces().catch(error => {
    console.error("❌ Analysis failed:", error);
    process.exit(1);
  });
}

export { analyzeNonces };
