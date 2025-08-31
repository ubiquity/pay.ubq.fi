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
  permitId?: string;
  transaction?: string | null;
  beneficiaryAddress?: Address;
  amount?: string;
  tokenAddress?: Address;
  tokenSymbol?: string;
  tokenNetwork?: number;
  githubIssueUrl?: string;
  githubIssueNumber?: number;
  githubRepository?: string;
  githubOrganization?: string;
}

interface SyncBatch {
  owner: Address;
  wordPosMap: Map<bigint, bigint>; // wordPos -> bitmap
  nonces: bigint[];
}

interface EnhancedDoubleClaimAlert {
  permitId: string;
  owner: Address;
  beneficiaryAddress: Address;
  nonce: bigint;
  originalClaimTx: string;
  originalClaimTxUrl: string;
  doubleClaimTx?: string;
  doubleClaimTxUrl?: string;
  amount: string;
  tokenSymbol: string;
  tokenAddress: Address;
  tokenNetwork: number;
  githubIssueUrl: string;
  githubIssueNumber: number;
  githubRepository: string;
  githubOrganization: string;
  detectedAt: string;
  wordPos: bigint;
  bitPos: bigint;
  actionRequired: string;
}

// Helper functions
function nonceBitmap(nonce: bigint): { wordPos: bigint; bitPos: bigint } {
  const wordPos = nonce >> 8n;
  const bitPos = nonce & 0xffn;
  return { wordPos, bitPos };
}

// Generate blockchain explorer URL based on network
function getExplorerUrl(network: number, txHash: string): string {
  if (network === 100) {
    return `https://gnosisscan.io/tx/${txHash}`;
  } else if (network === 1) {
    return `https://etherscan.io/tx/${txHash}`;
  }
  return `https://blockscout.com/tx/${txHash}`;
}

// Extract GitHub issue info from URL
function parseGitHubUrl(url: string | null): { 
  organization?: string; 
  repository?: string; 
  issueNumber?: number;
  fullUrl?: string;
} {
  if (!url) return {};
  
  // Match GitHub issue URL pattern
  const match = url.match(/github\.com\/([^\/]+)\/([^\/]+)\/issues\/(\d+)/);
  if (match) {
    return {
      organization: match[1],
      repository: match[2],
      issueNumber: parseInt(match[3]),
      fullUrl: url
    };
  }
  
  return { fullUrl: url };
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
): Promise<{ permits: Map<string, Set<bigint>>; permitDetails: Map<string, PermitData>; allPermitsByNonce: Map<string, any[]> }> {
  console.log("Fetching all permits from database with enhanced details...");

  // Fetch ALL permits - Supabase has a default 1000 limit, so we need multiple pages
  let allData: any[] = [];
  let start = 0;
  const pageSize = 1000;
  
  console.log("Fetching all permits in batches to avoid Supabase default limit...");
  
  while (true) {
    const { data, error } = await supabase
      .from("permits")
      .select(
        `
        id,
        nonce,
        transaction,
        amount,
        beneficiary_id,
        tokens(
          network,
          address
        ),
        partners(
          wallets(
            address
          )
        ),
        locations(
          node_url,
          issue_id,
          repository_id,
          organization_id
        )
      `
      )
      .range(start, start + pageSize - 1)
      .order('id', { ascending: true });

    if (error) {
      throw new Error(`Failed to fetch permits: ${error.message}`);
    }

    if (!data || data.length === 0) {
      break;
    }

    allData.push(...data);
    console.log(`  Fetched batch ${Math.floor(start / pageSize) + 1}: ${data.length} permits (total: ${allData.length})`);
    
    if (data.length < pageSize) {
      // Last page
      break;
    }
    
    start += pageSize;
  }

  const data = allData;

  // Group permits by owner address (normalize to lowercase)
  const permitsByOwner = new Map<string, Set<bigint>>();
  const permitDetails = new Map<string, PermitData>();
  const allPermitsByNonce = new Map<string, any[]>();
  let totalPermits = 0;

  // Get unique beneficiary IDs to fetch user addresses
  const beneficiaryIds = new Set<number>();
  if (data) {
    // First pass: collect all permits by nonce for double-claim detection
    for (const permit of data) {
      const nonceKey = permit.nonce.toString();
      if (!allPermitsByNonce.has(nonceKey)) {
        allPermitsByNonce.set(nonceKey, []);
      }
      allPermitsByNonce.get(nonceKey)!.push(permit);
      
      if (permit.beneficiary_id) {
        beneficiaryIds.add(permit.beneficiary_id);
      }
    }
  }

  // Fetch beneficiary addresses
  const beneficiaryMap = new Map<number, string>();
  if (beneficiaryIds.size > 0) {
    const { data: users } = await supabase
      .from("users")
      .select("id, wallet_id")
      .in("id", Array.from(beneficiaryIds));
    
    if (users) {
      // Get wallet addresses for users
      const walletIds = users.map(u => u.wallet_id).filter(Boolean);
      if (walletIds.length > 0) {
        const { data: wallets } = await supabase
          .from("wallets")
          .select("id, address")
          .in("id", walletIds);
        
        if (wallets) {
          const walletAddressMap = new Map(wallets.map(w => [w.id, w.address]));
          for (const user of users) {
            if (user.wallet_id) {
              const address = walletAddressMap.get(user.wallet_id);
              if (address) {
                beneficiaryMap.set(user.id, address);
              }
            }
          }
        }
      }
    }
  }

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
        
        // Parse GitHub URL if available
        const githubInfo = parseGitHubUrl(permit.locations?.node_url || null);
        
        // Get beneficiary address from map
        const beneficiaryAddress = beneficiaryMap.get(permit.beneficiary_id) || "0x0000000000000000000000000000000000000000";
        
        // Derive token symbol from common known addresses or use generic
        const tokenAddress = permit.tokens?.address?.toLowerCase();
        let tokenSymbol = "TOKEN";
        
        // Common token addresses (can be extended)
        const tokenSymbols: Record<string, string> = {
          "0xe91d153e0b41518a2ce8dd3d7944fa863463a97d": "WXDAI", // Wrapped xDAI on Gnosis
          "0x4ecaba5870353805a9f068101a40e0f32ed605c6": "USDT", // USDT on Gnosis
          "0xddafbb505ad214d7b80b1f830fccc89b60fb7a83": "USDC", // USDC on Gnosis
          "0x6b175474e89094c44da98b954eedeac495271d0f": "DAI", // DAI on Mainnet
          "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48": "USDC", // USDC on Mainnet
          "0xdac17f958d2ee523a2206206994597c13d831ec7": "USDT", // USDT on Mainnet
        };
        
        if (tokenAddress && tokenSymbols[tokenAddress]) {
          tokenSymbol = tokenSymbols[tokenAddress];
        }
        
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
          permitId: permit.id.toString(),
          transaction: permit.transaction,
          beneficiaryAddress: beneficiaryAddress as Address,
          amount: permit.amount,
          tokenAddress: permit.tokens?.address as Address,
          tokenSymbol: tokenSymbol,
          tokenNetwork: network,
          githubIssueUrl: githubInfo.fullUrl,
          githubIssueNumber: githubInfo.issueNumber,
          githubRepository: githubInfo.repository,
          githubOrganization: githubInfo.organization,
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

  return { permits: permitsByOwner, permitDetails, allPermitsByNonce };
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
  allPermitsByNonce: Map<string, any[]>,
  isDryRun: boolean
): Promise<EnhancedDoubleClaimAlert[]> {
  console.log("\n=== Checking for Double Claims in Database ===");
  
  const doubleClaimAlerts: EnhancedDoubleClaimAlert[] = [];
  const processedNonces = new Set<string>();
  
  console.log(`Checking all ${allPermitsByNonce.size} unique nonces for double claims...`);
  
  // Check every nonce for multiple claimed permits
  for (const [nonceStr, permitsWithSameNonce] of allPermitsByNonce.entries()) {
    if (processedNonces.has(nonceStr)) continue;
    processedNonces.add(nonceStr);
    
    // Find all claimed permits with this nonce
    const claimedPermitsWithSameNonce = permitsWithSameNonce.filter(p => p.transaction);
    
    if (claimedPermitsWithSameNonce.length > 1) {
      console.log(`\n🚨 DOUBLE CLAIM DETECTED for nonce ${nonceStr}:`);
      console.log(`  Found ${claimedPermitsWithSameNonce.length} claimed permits with the same nonce`);
      
      // Take the first permit as "original" and others as "double claims"
      const originalPermit = claimedPermitsWithSameNonce[0];
      const doubleClaimPermits = claimedPermitsWithSameNonce.slice(1);
      
      for (const doubleClaimPermit of doubleClaimPermits) {
        console.log(`  Original: Permit ${originalPermit.id}, TX: ${originalPermit.transaction}`);
        console.log(`  Double:   Permit ${doubleClaimPermit.id}, TX: ${doubleClaimPermit.transaction}`);
        
        // Get beneficiary info for the original permit
        let permitData = permits.find(p => p.permitId === originalPermit.id.toString());
        
        // If we can't find it in processed permits, create a minimal one
        if (!permitData) {
          const { wordPos, bitPos } = nonceBitmap(BigInt(originalPermit.nonce));
          permitData = {
            owner: "0x9051eda96db419c967189f4ac303a290f3327680" as Address, // Default owner
            nonce: BigInt(originalPermit.nonce),
            wordPos,
            bitPos,
            isUsedOnPermit2Mainnet: false,
            isUsedOnPermit2Gnosis: false,
            isUsedOnPermit3Gnosis: false,
            needsSync: false,
            permitId: originalPermit.id.toString(),
            transaction: originalPermit.transaction,
            beneficiaryAddress: "0x0000000000000000000000000000000000000000" as Address,
            amount: originalPermit.amount,
            tokenSymbol: "TOKEN",
          };
        }
        
        const alert: EnhancedDoubleClaimAlert = {
          permitId: originalPermit.id.toString(),
          owner: permitData.owner,
          beneficiaryAddress: permitData.beneficiaryAddress || ("0x0000000000000000000000000000000000000000" as Address),
          nonce: permitData.nonce,
          originalClaimTx: originalPermit.transaction,
          originalClaimTxUrl: getExplorerUrl(100, originalPermit.transaction),
          doubleClaimTx: doubleClaimPermit.transaction,
          doubleClaimTxUrl: getExplorerUrl(100, doubleClaimPermit.transaction),
          amount: originalPermit.amount || "0",
          tokenSymbol: permitData.tokenSymbol || "TOKEN",
          tokenAddress: permitData.tokenAddress || ("0x0000000000000000000000000000000000000000" as Address),
          tokenNetwork: 100,
          githubIssueUrl: permitData.githubIssueUrl || "",
          githubIssueNumber: permitData.githubIssueNumber || 0,
          githubRepository: permitData.githubRepository || "",
          githubOrganization: permitData.githubOrganization || "",
          detectedAt: new Date().toISOString(),
          wordPos: permitData.wordPos,
          bitPos: permitData.bitPos,
          actionRequired: `CONFIRMED DOUBLE CLAIM! Recover ${originalPermit.amount} TOKEN from double claimant. Additional permit: ${doubleClaimPermit.id}`,
        };
        
        doubleClaimAlerts.push(alert);
      }
    }
  }
  
  // Now also check for cross-chain double claims (claimed on both Permit2 and Permit3)
  console.log("\n=== Checking for Cross-Chain Double Claims ===");
  
  const claimedPermits = permits.filter(p => p.transaction !== null && p.transaction !== undefined);
  
  if (claimedPermits.length === 0) {
    console.log("No claimed permits found in processed dataset.");
    return doubleClaimAlerts;
  }
  
  console.log(`Checking ${claimedPermits.length} previously claimed permits for cross-chain double-claim attempts...`);
  
  // Prepare pairs for batch checking
  const claimedPairs = claimedPermits.map(p => ({ owner: p.owner, nonce: p.nonce }));
  
  // Batch check current status on Permit3
  const permit3StatusAfterMigration = await batchCheckNonceStatuses(
    CHAIN_CONFIGS[100].rpcUrl,
    PERMIT3_ADDRESS,
    claimedPairs
  );
  
  // Check each claimed permit for cross-chain issues
  for (const permit of claimedPermits) {
    const key = `${permit.owner.toLowerCase()}_${permit.nonce}`;
    const isUsedOnPermit3Now = permit3StatusAfterMigration.get(key) || false;
    
    // If this permit was claimed on Permit2 and the nonce is also used on Permit3,
    // it might indicate a cross-chain double-claim situation
    if (isUsedOnPermit3Now && permit.transaction) {
      // Try to find the double claim transaction by checking for other permits with the same nonce
      let doubleClaimTx: string | undefined;
      
      // Check if there are other permits with the same nonce in the database
      const nonceKey = permit.nonce.toString();
      const permitsWithSameNonce = allPermitsByNonce.get(nonceKey) || [];
      
      console.log(`  Checking for double claims: Found ${permitsWithSameNonce.length} permits with nonce ${permit.nonce}`);
      
      // Find other claimed permits with the same nonce
      const otherClaimedPermits = permitsWithSameNonce.filter(p => 
        p.transaction && 
        p.transaction !== permit.transaction &&
        p.id !== parseInt(permit.permitId || "0")
      );
      
      if (otherClaimedPermits.length > 0) {
        // Found actual double claim!
        doubleClaimTx = otherClaimedPermits[0].transaction;
        console.log(`  🚨 FOUND DOUBLE CLAIM! Original: ${permit.transaction}, Double claim: ${doubleClaimTx}`);
      } else {
        // No double claim found in database, try checking on-chain events
        try {
          console.log(`  No double claim found in database, checking on-chain events...`);
          
          const logs = await gnosisClient.getLogs({
            address: PERMIT3_ADDRESS,
            event: {
              type: "event",
              name: "UnorderedNonceInvalidation",
              inputs: [
                { indexed: true, name: "owner", type: "address" },
                { indexed: false, name: "word", type: "uint256" },
                { indexed: false, name: "mask", type: "uint256" }
              ],
            },
            args: {
              owner: permit.owner,
            },
            fromBlock: 30000000n,
            toBlock: "latest",
          });
          
          // Find the log entry where our nonce's bit was invalidated
          const matchingLog = logs.find(log => {
            const word = log.args?.word as bigint | undefined;
            const mask = log.args?.mask as bigint | undefined;
            
            if (word === undefined || mask === undefined) return false;
            
            // Check if this event invalidated our specific nonce
            return word === permit.wordPos && (mask & (1n << permit.bitPos)) !== 0n;
          });
          
          if (matchingLog && matchingLog.transactionHash) {
            // Verify this is not the original transaction
            if (matchingLog.transactionHash.toLowerCase() !== permit.transaction?.toLowerCase()) {
              doubleClaimTx = matchingLog.transactionHash;
              console.log(`  Found potential double claim tx on-chain: ${doubleClaimTx}`);
            }
          }
        } catch (error) {
          console.log(`  Could not fetch Permit3 events`);
        }
      }
      
      const alert: EnhancedDoubleClaimAlert = {
        permitId: permit.permitId || "unknown",
        owner: permit.owner,
        beneficiaryAddress: permit.beneficiaryAddress || ("0x0000000000000000000000000000000000000000" as Address),
        nonce: permit.nonce,
        originalClaimTx: permit.transaction,
        originalClaimTxUrl: getExplorerUrl(permit.tokenNetwork || 100, permit.transaction),
        doubleClaimTx: doubleClaimTx,
        doubleClaimTxUrl: doubleClaimTx ? getExplorerUrl(100, doubleClaimTx) : "Nonce migrated to Permit3 - awaiting double claim attempt",
        amount: permit.amount || "0",
        tokenSymbol: permit.tokenSymbol || "UNKNOWN",
        tokenAddress: permit.tokenAddress || ("0x0000000000000000000000000000000000000000" as Address),
        tokenNetwork: permit.tokenNetwork || 100,
        githubIssueUrl: permit.githubIssueUrl || "",
        githubIssueNumber: permit.githubIssueNumber || 0,
        githubRepository: permit.githubRepository || "",
        githubOrganization: permit.githubOrganization || "",
        detectedAt: new Date().toISOString(),
        wordPos: permit.wordPos,
        bitPos: permit.bitPos,
        actionRequired: `Monitor for double claim attempts. Original claim: ${permit.amount} ${permit.tokenSymbol} by ${permit.beneficiaryAddress}`,
      };
      
      doubleClaimAlerts.push(alert);
      
      console.log(`\n⚠️  DOUBLE CLAIM ALERT ⚠️`);
      console.log(`  Permit ID: ${alert.permitId}`);
      console.log(`  Beneficiary: ${alert.beneficiaryAddress}`);
      console.log(`  Amount: ${alert.amount} ${alert.tokenSymbol}`);
      console.log(`  GitHub Issue: ${alert.githubIssueUrl || 'N/A'}`);
      console.log(`  Original Claim: ${alert.originalClaimTxUrl}`);
      console.log(`  Double Claim: ${alert.doubleClaimTxUrl}`);
      console.log(`  Action: ${alert.actionRequired}`);
    }
  }
  
  if (doubleClaimAlerts.length === 0) {
    console.log("✅ No double claims detected!");
  } else {
    console.log(`\n❌ Found ${doubleClaimAlerts.length} potential double claim(s) that require investigation!`);
    
    // Summary by beneficiary
    const beneficiarySummary = new Map<string, { count: number; totalAmount: Map<string, bigint> }>();
    for (const alert of doubleClaimAlerts) {
      const key = alert.beneficiaryAddress.toLowerCase();
      if (!beneficiarySummary.has(key)) {
        beneficiarySummary.set(key, { count: 0, totalAmount: new Map() });
      }
      const summary = beneficiarySummary.get(key)!;
      summary.count++;
      
      // Aggregate amounts by token
      const currentAmount = summary.totalAmount.get(alert.tokenSymbol) || 0n;
      try {
        summary.totalAmount.set(alert.tokenSymbol, currentAmount + BigInt(alert.amount));
      } catch {
        // Handle non-numeric amounts
      }
    }
    
    console.log("\n📊 Double Claims Summary by Beneficiary:");
    for (const [beneficiary, summary] of beneficiarySummary.entries()) {
      console.log(`  ${beneficiary}: ${summary.count} claims`);
      for (const [token, amount] of summary.totalAmount.entries()) {
        console.log(`    - ${amount.toString()} ${token}`);
      }
    }
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
  console.log("=== Permit2 to Permit3 Migration Tool (Enhanced Edition) ===\n");

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
  const { permits: permitsByOwner, permitDetails, allPermitsByNonce } = await fetchPermitsFromDatabase(supabase);

  // Step 2: Analyze permit statuses across all chains using batch RPC
  const allPermits = await analyzePermitsWithBatch(permitsByOwner, permitDetails);

  // Step 3: Filter permits that need syncing
  const permitsToSync = allPermits.filter(p => p.needsSync);
  console.log(`\n${permitsToSync.length} permits need to be synced to Permit3`);

  if (permitsToSync.length === 0) {
    console.log("No permits need syncing. All permits are already synchronized!");
    
    // Still check for double claims even if no syncing needed
    const doubleClaimAlerts = await checkForDoubleClaims(allPermits, allPermitsByNonce, isDryRun);
    
    if (doubleClaimAlerts.length > 0) {
      const alertReportPath = `./reports/double-claim-alerts-enhanced-${Date.now()}.json`;
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
  const doubleClaimAlerts = await checkForDoubleClaims(allPermits, allPermitsByNonce, isDryRun);

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
      beneficiaryAddress: p.beneficiaryAddress,
      amount: p.amount,
      tokenSymbol: p.tokenSymbol,
      githubIssue: p.githubIssueUrl,
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

  // Ensure reports directory exists
  const fs = await import("fs");
  if (!fs.existsSync("./reports")) {
    fs.mkdirSync("./reports", { recursive: true });
  }

  const reportPath = `./reports/permit2-to-permit3-sync-enhanced-${isDryRun ? "dry-run-" : ""}${Date.now()}.json`;
  await Bun.write(reportPath, JSON.stringify(detailedReport, null, 2));
  console.log(`\nDetailed report saved to ${reportPath}`);

  // Save separate double claim alerts file if any were found
  if (doubleClaimAlerts.length > 0) {
    const alertReportPath = `./reports/double-claim-alerts-enhanced-${isDryRun ? "dry-run-" : ""}${Date.now()}.json`;
    const alertsForSave = doubleClaimAlerts.map(alert => ({
      ...alert,
      nonce: alert.nonce.toString(),
      wordPos: alert.wordPos.toString(),
      bitPos: alert.bitPos.toString(),
    }));
    
    // Create actionable CSV report
    const csvHeader = "Permit ID,Beneficiary,Amount,Token,GitHub Issue,Original Claim TX,Double Claim TX,Action Required\n";
    const csvRows = doubleClaimAlerts.map(alert => 
      `"${alert.permitId}","${alert.beneficiaryAddress}","${alert.amount}","${alert.tokenSymbol}","${alert.githubIssueUrl}","${alert.originalClaimTxUrl}","${alert.doubleClaimTxUrl || 'Investigation Required'}","${alert.actionRequired}"`
    ).join("\n");
    
    await Bun.write(alertReportPath, JSON.stringify(alertsForSave, null, 2));
    await Bun.write(alertReportPath.replace('.json', '.csv'), csvHeader + csvRows);
    
    console.log(`⚠️  Double claim alerts saved to ${alertReportPath}`);
    console.log(`📊  CSV report saved to ${alertReportPath.replace('.json', '.csv')}`);
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