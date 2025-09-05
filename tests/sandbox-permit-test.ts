import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { createRpcClient, type JsonRpcResponse } from "@ubiquity-dao/permit2-rpc-client";
import { PermitTransferFrom, SignatureTransfer } from "@uniswap/permit2-sdk";
import { type Address, encodeFunctionData, erc20Abi, parseAbiItem, recoverAddress } from "viem";
// Import from config causes web worker context issues in Node, use direct addresses
const PERMIT2 = "0x000000000022D473030F116dDEE9F6B43aC78BA3";
const PERMIT3 = "0xd635918A75356D133d5840eE5c9ED070302C9C60";
import type { Database, Tables } from "./frontend/src/database.types.ts";
import type { AllowanceAndBalance, PermitData } from "./frontend/src/types.ts";

// Hard-coded wallet address from the handoff document
const WALLET_ADDRESS = "0x4007CE2083c7F3E18097aeB3A39bb8eC149a341d";

// Environment variables
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || "";
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || "";
const PROXY_BASE_URL = "https://rpc.ubq.fi";

// Initialize clients
let supabase: SupabaseClient<Database>;
let rpcClient: ReturnType<typeof createRpcClient>;

// Table names
const PERMITS_TABLE = "permits";
const WALLETS_TABLE = "wallets";
const TOKENS_TABLE = "tokens";
const PARTNERS_TABLE = "partners";
const LOCATIONS_TABLE = "locations";

// ABIs
const permit2Abi = parseAbiItem("function nonceBitmap(address owner, uint256 wordPos) view returns (uint256)");

// Types from worker
type PermitRow = Tables<"permits"> & {
  token: Tables<"tokens"> | null;
  partner: (Tables<"partners"> & { wallet: Tables<"wallets"> | null }) | null;
  location: Tables<"locations"> | null;
};

interface PermitWithBeneficiary extends PermitRow {
  users?: {
    wallets?: {
      address?: string;
    };
  };
}

interface JsonRpcRequest {
  jsonrpc: "2.0";
  method: string;
  params: unknown[];
  id: number | string;
}

// === STEP 1: DATABASE QUERY ===
async function fetchPermitsFromDatabase(walletAddress: string): Promise<PermitRow[]> {
  if (!supabase) throw new Error("Supabase client not initialized.");

  // Normalize wallet address for consistent comparison
  const normalizedWalletAddress = walletAddress.toLowerCase();

  let permitsData: unknown[] = [];

  // Query for permits where user can claim (beneficiary) - only unclaimed (transaction is null)
  const beneficiaryJoinQuery = `
            *,
            token:${TOKENS_TABLE}(address, network),
            partner:${PARTNERS_TABLE}(wallet:${WALLETS_TABLE}(address)),
            location:${LOCATIONS_TABLE}(node_url),
            users!inner(
                wallets!inner(address)
            )
  `;

  let beneficiaryQuery = supabase
    .from(PERMITS_TABLE)
    .select(beneficiaryJoinQuery)
    .is("transaction", null)
    .filter("users.wallets.address", "ilike", normalizedWalletAddress);

  // Query for permits where user is the owner (funding wallet) - only unclaimed for invalidation
  const ownerJoinQuery = `
            *,
            token:${TOKENS_TABLE}(address, network),
            partner:${PARTNERS_TABLE}!inner(wallet:${WALLETS_TABLE}!inner(address)),
            location:${LOCATIONS_TABLE}(node_url),
            users(
                wallets(address)
            )
  `;

  let ownerQuery = supabase
    .from(PERMITS_TABLE)
    .select(ownerJoinQuery)
    .is("transaction", null)
    .filter("partner.wallet.address", "ilike", normalizedWalletAddress);

  // Execute both queries
  const [beneficiaryResult, ownerResult] = await Promise.all([beneficiaryQuery, ownerQuery]);

  // Combine results and remove duplicates
  const permitMap = new Map<number, unknown>();

  if (beneficiaryResult.error) {
    console.error(`Database query error (beneficiary): ${beneficiaryResult.error.message}`, beneficiaryResult.error);
  } else if (beneficiaryResult.data && beneficiaryResult.data.length > 0) {
    console.log(`Found ${beneficiaryResult.data.length} permits as beneficiary`);
    beneficiaryResult.data.forEach((permit) => {
      permitMap.set(permit.id, permit);
    });
  }

  if (ownerResult.error) {
    console.error(`Database query error (owner): ${ownerResult.error.message}`, ownerResult.error);
  } else if (ownerResult.data && ownerResult.data.length > 0) {
    console.log(`Found ${ownerResult.data.length} permits as owner`);
    ownerResult.data.forEach((permit) => {
      permitMap.set(permit.id, permit);
    });
  }

  permitsData = Array.from(permitMap.values());
  console.log(`Total unique permits from database: ${permitsData.length}`);

  return permitsData as unknown as PermitRow[];
}

// === STEP 2: BASIC VALIDATION ===
function runBasicValidation(rawPermits: PermitRow[]): { valid: PermitData[]; invalid: { permit: PermitRow; reason: string }[] } {
  const valid: PermitData[] = [];
  const invalid: { permit: PermitRow; reason: string }[] = [];

  for (let i = 0; i < rawPermits.length; i++) {
    const permit = rawPermits[i];
    const errors: string[] = [];
    
    const tokenData = permit.token;
    const ownerWalletData = permit.partner?.wallet;
    const permitWithBeneficiary = permit as PermitWithBeneficiary;
    const beneficiaryWalletData = permitWithBeneficiary.users?.wallets;
    
    const ownerAddressStr = ownerWalletData?.address ? String(ownerWalletData.address) : "";
    const beneficiaryAddressStr = beneficiaryWalletData?.address ? String(beneficiaryWalletData.address) : "";
    const tokenAddressStr = tokenData?.address ? String(tokenData.address) : undefined;
    const networkIdNum = Number(tokenData?.network ?? 0);

    if (!ownerAddressStr) {
      errors.push("missing owner address");
    }
    
    if (!tokenAddressStr) {
      errors.push("missing token address");
    }
    
    if (networkIdNum === 0) {
      errors.push("invalid network ID");
    }
    
    if (!permit.deadline) {
      errors.push("missing deadline");
    }
    
    if (!permit.signature || !permit.signature.startsWith("0x")) {
      errors.push("invalid signature format");
    }

    if (permit.amount != undefined && permit.amount != null) {
      try {
        BigInt(permit.amount);
      } catch {
        errors.push("invalid amount format");
      }
    }

    if (errors.length > 0) {
      invalid.push({ permit, reason: errors.join(", ") });
      continue;
    }

    // Map to PermitData
    try {
      const actualBeneficiary = beneficiaryAddressStr || WALLET_ADDRESS.toLowerCase();
      const githubUrlStr = permit.location?.node_url ? String(permit.location.node_url) : "";

      const permitData: PermitData = {
        permit2Address: PERMIT3 as `0x${string}`, // We'll determine this in RPC validation
        nonce: String(permit.nonce),
        networkId: networkIdNum,
        beneficiary: actualBeneficiary,
        beneficiaryUserId: permit.beneficiary_id ? Number(permit.beneficiary_id) : undefined,
        deadline: String(permit.deadline),
        signature: String(permit.signature),
        type: "erc20-permit",
        owner: ownerAddressStr,
        tokenAddress: tokenAddressStr,
        token: tokenAddressStr ? { address: tokenAddressStr, network: networkIdNum } : undefined,
        amount: BigInt(permit.amount),
        token_id: permit.token_id != undefined && permit.token_id != null ? Number(permit.token_id) : undefined,
        githubCommentUrl: githubUrlStr,
        partner: ownerAddressStr ? { wallet: { address: ownerAddressStr } } : undefined,
        claimStatus: "Idle",
        status: "Fetching",
        ...(permit.created && { created_at: permit.created }),
      };

      // Final validation
      if (!permitData.nonce || !permitData.deadline || !permitData.signature || !permitData.beneficiary || !permitData.owner || !permitData.token?.address) {
        invalid.push({ permit, reason: "missing essential fields after mapping" });
        continue;
      }

      // Check deadline
      if (typeof permitData.deadline !== "string" || isNaN(parseInt(permitData.deadline, 10))) {
        invalid.push({ permit, reason: "invalid deadline format" });
        continue;
      }
      
      const deadlineInt = parseInt(permitData.deadline, 10);
      if (isNaN(deadlineInt) || deadlineInt < Math.floor(Date.now() / 1000)) {
        permitData.status = "Expired";
      }

      valid.push(permitData);
    } catch (error) {
      invalid.push({ permit, reason: `mapping error: ${error instanceof Error ? error.message : String(error)}` });
    }
  }

  return { valid, invalid };
}

// === STEP 3: RPC VALIDATION ===
async function getPermit2Address(permitData: {
  tokenAddress: string;
  amount: string;
  nonce: string;
  deadline: string;
  beneficiary: string;
  owner: string;
  signature: string;
  networkId: number;
}): Promise<string> {
  const permit: PermitTransferFrom = {
    permitted: {
      token: permitData.tokenAddress as Address,
      amount: BigInt(permitData.amount),
    },
    nonce: BigInt(permitData.nonce),
    deadline: BigInt(permitData.deadline),
    spender: permitData.beneficiary as Address,
  };
  const hash = SignatureTransfer.hash(permit, PERMIT3, permitData.networkId) as `0x${string}`;
  const signer = await recoverAddress({ hash, signature: permitData.signature as `0x${string}` });
  if (signer.toLowerCase() === permitData.owner.toLowerCase()) {
    return PERMIT3;
  }
  return PERMIT2;
}

async function runRpcValidation(permits: PermitData[]): Promise<PermitData[]> {
  if (!rpcClient) throw new Error("RPC client not initialized.");
  if (permits.length === 0) return [];

  const checkedPermitsMap = new Map<string, Partial<PermitData & { isNonceUsed?: boolean }>>();
  const permitsByKey = new Map<string, PermitData>(permits.map((p) => [p.signature, p]));

  // Group permits by network
  const permitsByNetwork = permits.reduce((map, permit) => {
    const networkPermits = map.get(permit.networkId) || [];
    networkPermits.push(permit);
    map.set(permit.networkId, networkPermits);
    return map;
  }, new Map<number, PermitData[]>());

  for (const [networkId, networkPermits] of permitsByNetwork.entries()) {
    const batchRequests: { request: JsonRpcRequest; key: string; type: string; chainId: number }[] = [];
    let requestIdCounter = 1;

    // First, determine correct permit2 address for each permit
    for (const permit of networkPermits) {
      try {
        permit.permit2Address = await getPermit2Address({
          nonce: permit.nonce,
          tokenAddress: permit.tokenAddress ?? "",
          amount: permit.amount.toString(),
          deadline: permit.deadline,
          beneficiary: permit.beneficiary,
          owner: permit.owner,
          signature: permit.signature,
          networkId: permit.networkId,
        }) as `0x${string}`;
      } catch (error) {
        const updateData = checkedPermitsMap.get(permit.signature) || {};
        updateData.checkError = `Failed to determine permit2 address: ${error instanceof Error ? error.message : String(error)}`;
        checkedPermitsMap.set(permit.signature, updateData);
        continue;
      }

      // Create nonce check request
      const owner = permit.owner as Address;
      const wordPos = BigInt(permit.nonce) >> 8n;
      
      batchRequests.push({
        request: {
          jsonrpc: "2.0",
          method: "eth_call",
          params: [
            { 
              to: permit.permit2Address, 
              data: encodeFunctionData({ 
                abi: [permit2Abi], 
                functionName: "nonceBitmap", 
                args: [owner, wordPos] 
              }) 
            },
            "latest",
          ],
          id: requestIdCounter++,
        },
        key: permit.signature,
        type: "nonce",
        chainId: permit.networkId,
      });
    }

    if (batchRequests.length === 0) continue;

    try {
      console.log(`Making RPC batch request for network ${networkId} with ${batchRequests.length} requests`);
      const batchPayload = batchRequests.map((br) => br.request);
      const batchResponses = (await rpcClient.request(networkId, batchPayload)) as JsonRpcResponse[];
      
      console.log(`Received ${batchResponses.length} responses for network ${networkId}`);

      // Process responses
      const responseMap = new Map<number, JsonRpcResponse>(batchResponses.map((res) => [res.id as number, res]));

      batchRequests.forEach((batchReq) => {
        const permit = permitsByKey.get(batchReq.key);
        if (!permit) return;

        const updateData: Partial<PermitData & { isNonceUsed?: boolean }> = checkedPermitsMap.get(batchReq.key) || {};
        const res = responseMap.get(batchReq.request.id as number);

        if (!res) {
          updateData.checkError = `Batch response missing (${batchReq.type})`;
        } else if (res.error) {
          updateData.checkError = `Check failed (${batchReq.type}). ${res.error.message}`;
        } else if (res.result !== undefined && res.result !== null) {
          try {
            const bitmap = BigInt(res.result as string);
            updateData.isNonceUsed = Boolean(bitmap & (1n << (BigInt(permit.nonce) & 255n)));
            updateData.status = updateData.isNonceUsed ? "Claimed" : "Valid";
          } catch (parseError: unknown) {
            updateData.checkError = `Result parse error (${batchReq.type}). ${parseError instanceof Error ? parseError.message : String(parseError)}`;
          }
        } else {
          updateData.checkError = `Empty result (${batchReq.type})`;
        }
        
        checkedPermitsMap.set(batchReq.key, updateData);
      });

    } catch (error: unknown) {
      console.error("🚨 CRITICAL: RPC batch validation completely failed!");
      console.error("Network ID:", networkId);
      console.error("Permits count:", networkPermits.length);
      console.error("Batch requests count:", batchRequests.length);
      console.error("Full error details:", error);
      console.error("Error stack:", error instanceof Error ? error.stack : "No stack");
      
      // Mark all permits in this network as errored
      networkPermits.forEach((permit) => {
        const updateData = checkedPermitsMap.get(permit.signature) || {};
        updateData.checkError = `Batch request failed: ${error instanceof Error ? error.message : String(error)}`;
        checkedPermitsMap.set(permit.signature, updateData);
      });
    }
  }

  // Apply check results to permits
  const finalPermits = permits.map((permit) => {
    const checkData = checkedPermitsMap.get(permit.signature);
    return checkData ? { ...permit, ...checkData } : permit;
  });

  return finalPermits;
}

// === STEP 4: NONCE DEDUPLICATION ===
function runNonceDeduplication(permits: PermitData[]): PermitData[] {
  const permitsByNonce = permits.reduce((map, p) => {
    const list = map.get(p.nonce) || [];
    list.push(p);
    map.set(p.nonce, list);
    return map;
  }, new Map<string, PermitData[]>());

  console.log("=== NONCE DEDUPLICATION DEBUG ===");
  console.log("Total permits before dedup:", permits.length);
  console.log("Unique nonces:", permitsByNonce.size);
  
  for (const [nonce, nonceGroup] of permitsByNonce.entries()) {
    if (nonceGroup.length > 1) {
      console.log(`Nonce ${nonce.substring(0, 10)}...: ${nonceGroup.length} permits (WILL DEDUPE)`);
      
      const sortedByAmountDescending = nonceGroup.slice().sort((a, b) => {
        const diff = b.amount - a.amount;
        if (diff > 0n) return 1;
        if (diff < 0n) return -1;
        return 0;
      });
      
      // First try to find the highest amount permit without errors
      let passing = sortedByAmountDescending.find((p) => !p.checkError);
      
      // If all permits have errors, choose the highest amount one anyway
      if (!passing) {
        passing = sortedByAmountDescending[0];
      }
      
      console.log(`  Selected passing permit: ${passing?.signature?.substring(0, 10)}... (amount: ${passing?.amount})`);
      
      // Mark all other permits in this nonce group as duplicates
      nonceGroup.forEach((p) => {
        if (!p.signature || !passing?.signature) {
          if (!p.signature) {
            p.checkError = "missing signature";
          }
          return;
        }
        
        if (p.signature !== passing.signature) {
          console.log(`  Marking as duplicate: ${p.signature.substring(0, 10)}... (amount: ${p.amount})`);
          p.checkError = "permit with same nonce but higher amount exists";
        }
      });
    }
  }

  return permits;
}

// === STEP 5: FRONTEND FILTERING ===
function runFrontendFiltering(permits: PermitData[]): PermitData[] {
  const filtered: PermitData[] = [];
  
  console.log("=== FRONTEND FILTERING DEBUG ===");
  console.log("Input permits:", permits.length);
  
  // Analyze wordPos distribution to detect patterns
  const wordPosMap = new Map<string, number>();
  const usedNonceCount = permits.filter(p => p.isNonceUsed).length;
  
  permits.forEach(permit => {
    if (permit.nonce) {
      const wordPos = (BigInt(permit.nonce) >> 8n).toString();
      wordPosMap.set(wordPos, (wordPosMap.get(wordPos) || 0) + 1);
    }
  });
  
  console.log(`🔍 NONCE ANALYSIS:`);
  console.log(`  Total permits: ${permits.length}`);
  console.log(`  Permits marked as used: ${usedNonceCount}`);
  console.log(`  Unique wordPos values: ${wordPosMap.size}`);
  console.log(`  WordPos distribution (top 10):`, Array.from(wordPosMap.entries()).sort((a,b) => b[1] - a[1]).slice(0, 10));
  
  // Analyze Permit2 vs Permit3 distribution
  const permit2Count = permits.filter(p => p.permit2Address === PERMIT2).length;
  const permit3Count = permits.filter(p => p.permit2Address === PERMIT3).length;
  const otherCount = permits.filter(p => p.permit2Address !== PERMIT2 && p.permit2Address !== PERMIT3).length;
  
  console.log(`🔍 CONTRACT ANALYSIS:`);
  console.log(`  Permit2 (${PERMIT2}): ${permit2Count} permits`);
  console.log(`  Permit3 (${PERMIT3}): ${permit3Count} permits`);  
  console.log(`  Other contracts: ${otherCount} permits`);
  
  if (permit2Count > 0 && permit3Count > 0) {
    console.log(`🚨 MIXED CONTRACTS: We have both Permit2 and Permit3 permits!`);
    
    const permit2Used = permits.filter(p => p.permit2Address === PERMIT2 && p.isNonceUsed).length;
    const permit3Used = permits.filter(p => p.permit2Address === PERMIT3 && p.isNonceUsed).length;
    
    console.log(`  Permit2 marked as used: ${permit2Used}/${permit2Count} (${Math.round(permit2Used/permit2Count*100)}%)`);
    console.log(`  Permit3 marked as used: ${permit3Used}/${permit3Count} (${Math.round(permit3Used/permit3Count*100)}%)`);
  }
  
  if (usedNonceCount === permits.length) {
    console.log(`🚨 SUSPICIOUS: ALL permits marked as used! This suggests bitmap logic issue.`);
  }

  let rpcFiltered = 0;
  let usedFiltered = 0; 
  let claimedFiltered = 0;
  let nonceFiltered = 0;
  let passedThrough = 0;

  permits.forEach((permit) => {
    console.log(`\n--- Permit ${permit.signature?.substring(0, 10)}... ---`);
    console.log(`Amount: ${permit.amount}`);
    console.log(`Nonce: ${permit.nonce?.substring(0, 10)}...`);
    console.log(`Full Nonce: ${permit.nonce}`);
    
    // Add bitmap position debugging
    if (permit.nonce) {
      const nonceBigInt = BigInt(permit.nonce);
      const wordPos = nonceBigInt >> 8n;
      const bitPos = nonceBigInt & 255n;
      console.log(`🔍 BITMAP DEBUG:`);
      console.log(`  WordPos (nonce >> 8): ${wordPos}`);
      console.log(`  BitPos (nonce & 255): ${bitPos}`);
      console.log(`  Expected bit mask: ${(1n << bitPos).toString(16)}`);
    }
    
    console.log(`Status: ${permit.status}`);
    console.log(`isNonceUsed: ${permit.isNonceUsed}`);
    console.log(`checkError: ${permit.checkError}`);
    
    // Check for RPC-related errors and log them for debugging
    if (permit.checkError) {
      console.error(`Validation error:`, permit.checkError);
      
      // If it's a serious RPC error that indicates the permit is unusable, filter it out
      const isRpcError = permit.checkError.toLowerCase().includes('rpc') || 
                        permit.checkError.toLowerCase().includes('network') ||
                        permit.checkError.toLowerCase().includes('batch request failed');
      
      if (isRpcError) {
        console.log("❌ FILTERED: RPC Error");
        rpcFiltered++;
        return; // Skip this permit due to RPC issues
      }
    }
    
    // Only filter out permits that are definitively claimed or used
    const definitelyUsed = permit.isNonceUsed === true;
    const definitelyClaimed = permit.status === "Claimed";
    const hasNonceError = !!(permit.checkError && permit.checkError.toLowerCase().includes("nonce"));
    
    const shouldFilter = definitelyUsed || definitelyClaimed || hasNonceError;
    if (definitelyUsed) {
      console.log("❌ FILTERED: Nonce definitely used");
      usedFiltered++;
    } else if (definitelyClaimed) {
      console.log("❌ FILTERED: Already claimed");
      claimedFiltered++;
    } else if (hasNonceError) {
      console.log("❌ FILTERED: Has nonce error");
      nonceFiltered++;
    } else {
      console.log("✅ PASSED: Will display in UI");
      passedThrough++;
      filtered.push(permit);
    }
  });

  console.log("\n=== FRONTEND FILTERING SUMMARY ===");
  console.log(`Input permits: ${permits.length}`);
  console.log(`RPC filtered: ${rpcFiltered}`);
  console.log(`Used filtered: ${usedFiltered}`);
  console.log(`Claimed filtered: ${claimedFiltered}`);
  console.log(`Nonce error filtered: ${nonceFiltered}`);
  console.log(`PASSED TO UI: ${passedThrough}`);
  
  return filtered;
}

// === MAIN SANDBOX FUNCTION ===
async function runPermitSandbox() {
  console.log("=== PERMIT SANDBOX TEST ===");
  console.log("Wallet:", WALLET_ADDRESS);
  
  // Initialize clients
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.error("❌ SUPABASE ENVIRONMENT VARIABLES MISSING");
    console.error("VITE_SUPABASE_URL:", SUPABASE_URL ? "✓" : "❌");
    console.error("VITE_SUPABASE_ANON_KEY:", SUPABASE_ANON_KEY ? "✓" : "❌");
    return;
  }
  
  try {
    supabase = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY);
    rpcClient = createRpcClient({ baseUrl: PROXY_BASE_URL });
    console.log("✅ Clients initialized successfully");
  } catch (error) {
    console.error("❌ FAILED TO INITIALIZE CLIENTS:", error);
    return;
  }
  
  // Step 1: Database Query
  console.log("\n1. DATABASE QUERY");
  let rawPermits: PermitRow[];
  try {
    rawPermits = await fetchPermitsFromDatabase(WALLET_ADDRESS);
    console.log(`Raw permits from DB: ${rawPermits.length}`);
    if (rawPermits.length === 0) {
      console.error("❌ NO PERMITS IN DATABASE - Issue is data creation");
      return;
    }
  } catch (error) {
    console.error("❌ DATABASE QUERY FAILED:", error);
    return;
  }
  
  // Step 2: Worker Basic Validation
  console.log("\n2. WORKER BASIC VALIDATION");
  const basicValidated = runBasicValidation(rawPermits);
  console.log(`After basic validation: ${basicValidated.valid.length} valid, ${basicValidated.invalid.length} invalid`);
  if (basicValidated.valid.length === 0) {
    console.error("❌ ALL PERMITS FAILED BASIC VALIDATION");
    console.error("Invalid permits sample:");
    basicValidated.invalid.slice(0, 5).forEach((invalid, i) => {
      console.error(`  ${i + 1}. ${invalid.reason}`);
    });
    return;
  }
  
  // Step 3: RPC Validation (the suspected failure point)
  console.log("\n3. RPC VALIDATION");
  let rpcValidated: PermitData[];
  try {
    rpcValidated = await runRpcValidation(basicValidated.valid);
    console.log(`After RPC validation: ${rpcValidated.length} permits processed`);
    
    const withErrors = rpcValidated.filter(p => p.checkError);
    const withoutErrors = rpcValidated.filter(p => !p.checkError);
    
    console.log(`Permits WITH errors: ${withErrors.length}`);
    console.log(`Permits WITHOUT errors: ${withoutErrors.length}`);
    
    if (withErrors.length > 0) {
      console.log("Sample errors:");
      withErrors.slice(0, 3).forEach((p, i) => {
        console.log(`  ${i + 1}. ${p.checkError}`);
      });
    }
    
    if (withoutErrors.length === 0) {
      console.error("❌ ALL PERMITS FAILED RPC VALIDATION");
      return;
    }
  } catch (error) {
    console.error("❌ RPC VALIDATION THREW EXCEPTION:", error);
    return;
  }
  
  // Step 4: Nonce Deduplication
  console.log("\n4. NONCE DEDUPLICATION");
  const afterDedup = runNonceDeduplication(rpcValidated);
  const duplicates = afterDedup.filter(p => p.checkError?.includes("same nonce"));
  const unique = afterDedup.filter(p => !p.checkError?.includes("same nonce"));
  console.log(`After deduplication: ${unique.length} unique, ${duplicates.length} duplicates`);
  
  // Step 5: Frontend Filtering
  console.log("\n5. FRONTEND FILTERING");
  const finalPermits = runFrontendFiltering(afterDedup);
  console.log(`Final permits for UI: ${finalPermits.length}`);
  
  // Step 6: Results
  console.log("\n=== FINAL RESULTS ===");
  if (finalPermits.length === 0) {
    console.error("❌ NO PERMITS SURVIVED THE PIPELINE");
    console.error("This proves the issue is in data processing, not UI rendering");
  } else {
    console.log(`✅ ${finalPermits.length} PERMITS READY FOR UI`);
    console.log("Sample permits:");
    finalPermits.slice(0, 3).forEach((permit, i) => {
      console.log(`  ${i + 1}. ${permit.signature?.substring(0, 10)}... Amount: ${permit.amount}`);
    });
    console.log("UI should show these permits - if it doesn't, the issue is in React rendering");
  }
}

// Run the test
if (import.meta.main) {
  runPermitSandbox().catch(console.error);
}