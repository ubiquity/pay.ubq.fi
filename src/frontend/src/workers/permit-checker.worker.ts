import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { createRpcClient, type JsonRpcResponse } from "@ubiquity-dao/permit2-rpc-client";
import { type Address, encodeFunctionData, erc20Abi, parseAbiItem } from "viem";
import { PERMIT3 } from "../constants/config.ts";
import type { Database, Tables } from "../database.types.ts"; // Import generated types
import type { AllowanceAndBalance, PermitData } from "../types.ts";

// --- Worker Setup ---

export type WorkerRequest =
  | { type: "INIT"; payload: { supabaseUrl: string; supabaseAnonKey: string; isDevelopment: boolean } }
  | { type: "FETCH_NEW_PERMITS"; payload: { address: Address; lastCheckTimestamp?: string | null } };

export type WorkerResponse =
  | { type: "INIT_SUCCESS" }
  | { type: "INIT_ERROR"; error: string }
  | { type: "NEW_PERMITS_VALIDATED"; permits: PermitData[]; balancesAndAllowances: Map<string, AllowanceAndBalance> }
  | { type: "PERMITS_ERROR"; error: string };

// Define the worker scope type
interface WorkerGlobalScope extends Worker {
  onmessage: (event: MessageEvent<WorkerRequest>) => void;
  postMessage: (message: WorkerResponse) => void;
}

// Use the worker global scope
const worker: WorkerGlobalScope = self as unknown as WorkerGlobalScope;

// Define table names
const PERMITS_TABLE = "permits";
const WALLETS_TABLE = "wallets";
const TOKENS_TABLE = "tokens";
const PARTNERS_TABLE = "partners";
const LOCATIONS_TABLE = "locations";

// ABIs needed for checks
const permit2Abi = parseAbiItem("function nonceBitmap(address owner, uint256 wordPos) view returns (uint256)");

// Initialize Supabase & RPC clients (will be set in INIT)
let supabase: SupabaseClient<Database> | null = null; // Use Database type
let rpcClient: ReturnType<typeof createRpcClient> | null = null;
let PROXY_BASE_URL = ""; // Will be set in INIT

// Define type for JSON-RPC Request object
interface JsonRpcRequest {
  jsonrpc: "2.0";
  method: string;
  params: unknown[];
  id: number | string;
}

// --- Database Fetching and Mapping ---

// Type alias for permits row using generated types
type PermitRow = Tables<"permits"> & {
  token: Tables<"tokens"> | null;
  partner: (Tables<"partners"> & { wallet: Tables<"wallets"> | null }) | null;
  location: Tables<"locations"> | null;
};

// Properly typed permit structure with users and wallets for beneficiary data
interface PermitWithBeneficiary extends PermitRow {
  users?: {
    wallets?: {
      address?: string;
    };
  };
}
// Debug mode flag - set via environment variable
const DEBUG_MODE = typeof import.meta.env !== "undefined" && import.meta.env.VITE_DEBUG_WORKER === "true";

// Helper function for conditional logging
function logValidationError(message: string, permit: PermitRow, index: number) {
  if (DEBUG_MODE) {
    console.debug(`[Validation] Permit ${index} (nonce: ${permit.nonce}): ${message}`);
  }
}

// Helper function to validate basic permit fields
function validateBasicPermitFields(permit: PermitRow, index: number): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];
  const tokenData = permit.token;
  const ownerWalletData = permit.partner?.wallet;
  
  const ownerAddressStr = ownerWalletData?.address ? String(ownerWalletData.address) : "";
  if (!ownerAddressStr) {
    logValidationError("Missing owner address", permit, index);
    errors.push("owner address");
  }
  
  const tokenAddressStr = tokenData?.address ? String(tokenData.address) : undefined;
  if (!tokenAddressStr) {
    logValidationError("Missing token address", permit, index);
    errors.push("token address");
  }
  
  const networkIdNum = Number(tokenData?.network ?? 0);
  if (networkIdNum === 0) {
    logValidationError(`Invalid network ID: ${tokenData?.network}`, permit, index);
    errors.push("network ID");
  }
  
  if (!permit.deadline) {
    logValidationError("Missing deadline", permit, index);
    errors.push("deadline");
  }
  
  if (!permit.signature || !permit.signature.startsWith("0x")) {
    logValidationError(`Invalid signature format: ${permit.signature}`, permit, index);
    errors.push("signature");
  }

  return { isValid: errors.length === 0, errors };
}

// Helper function to validate permit amount
function validatePermitAmount(permit: PermitRow, index: number): boolean {
  if (permit.amount != undefined && permit.amount != null) {
    try {
      BigInt(permit.amount);
      return true;
    } catch {
      logValidationError(`Invalid amount format: ${permit.amount}`, permit, index);
      return false;
    }
  }
  return true;
}

// Function to map DB result to PermitData (ERC20 only focus)
async function mapDbPermitToPermitData(permit: PermitRow, index: number, lowerCaseWalletAddress: string): Promise<PermitData | null> {
  // Validate basic fields first
  const validation = validateBasicPermitFields(permit, index);
  if (!validation.isValid) {
    return null;
  }
  
  // Validate amount format
  if (!validatePermitAmount(permit, index)) {
    return null;
  }

  const tokenData = permit.token;
  const ownerWalletData = permit.partner?.wallet;
  // Cast to properly typed interface for beneficiary data access
  const permitWithBeneficiary = permit as PermitWithBeneficiary;
  const beneficiaryWalletData = permitWithBeneficiary.users?.wallets;
  const ownerAddressStr = ownerWalletData?.address ? String(ownerWalletData.address) : "";
  const beneficiaryAddressStr = beneficiaryWalletData?.address ? String(beneficiaryWalletData.address) : "";
  const beneficiaryUserId = permit.beneficiary_id; // GitHub user ID
  const tokenAddressStr = tokenData?.address ? String(tokenData.address) : undefined;
  const networkIdNum = Number(tokenData?.network ?? 0);

  const githubUrlStr = permit.location?.node_url ? String(permit.location.node_url) : "";

  // Fallback to connected wallet address when beneficiary address is not set
  // This maintains backward compatibility with older permits that don't have
  // the beneficiary wallet relationship properly established in the database
  const actualBeneficiary = beneficiaryAddressStr || lowerCaseWalletAddress;

  // Since we now only fetch Permit3 permits from DB, use constant
  const permit2Address = PERMIT3;

  const permitData: PermitData = {
    permit2Address: permit2Address as `0x${string}`,
    nonce: String(permit.nonce),
    networkId: networkIdNum,
    beneficiary: actualBeneficiary, // Use actual beneficiary address
    beneficiaryUserId: beneficiaryUserId ? Number(beneficiaryUserId) : undefined, // Store GitHub user ID for username lookup
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
    ...(permit.created && { created_at: permit.created }), // Map 'created' from DB
  };

  // Basic validation (ensure essential fields are present)
  if (!permitData.nonce || !permitData.deadline || !permitData.signature || !permitData.beneficiary || !permitData.owner || !permitData.token?.address) {
    // Amount check removed as 0 is ok for type

    return null;
  }
  // Validate deadline format before parsing
  if (typeof permitData.deadline !== "string" || isNaN(parseInt(permitData.deadline, 10))) {
    return null;
  }
  const deadlineInt = parseInt(permitData.deadline, 10);
  if (isNaN(deadlineInt) || deadlineInt < Math.floor(Date.now() / 1000)) {
    permitData.status = "Expired";
  }
  return permitData;
}

// Function to fetch permits from Supabase using the proper relationships
async function fetchPermitsFromDb(walletAddress: string, lastCheckTimestamp: string | null): Promise<PermitRow[]> {
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
    // NOTE: Removed permit2_address filter - column doesn't exist in current schema
    // NOTE: Removed Gnosis Chain filter to test all networks
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
    // NOTE: Removed permit2_address filter - column doesn't exist in current schema
    // NOTE: Removed Gnosis Chain filter to test all networks
    .filter("partner.wallet.address", "ilike", normalizedWalletAddress);

  if (lastCheckTimestamp && !isNaN(Date.parse(lastCheckTimestamp))) {
    beneficiaryQuery = beneficiaryQuery.gt("created", lastCheckTimestamp);
    ownerQuery = ownerQuery.gt("created", lastCheckTimestamp);
  }

  console.log("=== DATABASE QUERY DEBUG ===");
  console.log("Normalized wallet address:", normalizedWalletAddress);
  console.log("Last check timestamp:", lastCheckTimestamp);
  console.log("Beneficiary query filters:", {
    transaction: "null",
    walletAddress: normalizedWalletAddress
  });
  console.log("Owner query filters:", {
    transaction: "null", 
    walletAddress: normalizedWalletAddress
  });

  // Execute both queries
  const [beneficiaryResult, ownerResult] = await Promise.all([beneficiaryQuery, ownerQuery]);

  console.log("=== QUERY RESULTS DEBUG ===");
  console.log("Beneficiary query result:", {
    error: beneficiaryResult.error?.message || null,
    dataLength: beneficiaryResult.data?.length || 0,
    data: beneficiaryResult.data?.slice(0, 2) // Show first 2 results for debugging
  });
  
  console.log("Owner query result:", {
    error: ownerResult.error?.message || null,
    dataLength: ownerResult.data?.length || 0,
    data: ownerResult.data?.slice(0, 2) // Show first 2 results for debugging
  });

  // Combine results and remove duplicates
  const permitMap = new Map<number, unknown>();

  if (beneficiaryResult.error) {
    console.error(`Worker: beneficiary query error: ${beneficiaryResult.error.message}`, beneficiaryResult.error);
  } else if (beneficiaryResult.data && beneficiaryResult.data.length > 0) {
    console.log(`Worker: Found ${beneficiaryResult.data.length} permits as beneficiary`);
    beneficiaryResult.data.forEach((permit) => {
      console.log(`Beneficiary permit ID ${permit.id}: nonce=${permit.nonce}, amount=${permit.amount}, network=${permit.token?.network}`);
      permitMap.set(permit.id, permit);
    });
  } else {
    console.log("Worker: No permits found as beneficiary");
  }

  if (ownerResult.error) {
    console.error(`Worker: owner query error: ${ownerResult.error.message}`, ownerResult.error);
  } else if (ownerResult.data && ownerResult.data.length > 0) {
    console.log(`Worker: Found ${ownerResult.data.length} permits as owner`);
    ownerResult.data.forEach((permit) => {
      console.log(`Owner permit ID ${permit.id}: nonce=${permit.nonce}, amount=${permit.amount}, network=${permit.token?.network}`);
      permitMap.set(permit.id, permit);
    });
  } else {
    console.log("Worker: No permits found as owner");
  }

  permitsData = Array.from(permitMap.values());
  console.log(`Worker: Total unique permits: ${permitsData.length}`);
  console.log("Final permit map size:", permitMap.size);

  if (permitsData.length === 0) {
    return [];
  }

  // Cast needed because Supabase client doesn't know about the joined types automatically
  return permitsData as unknown as PermitRow[];
}

// --- On-Chain Validation ---

// Helper function to create nonce check request
function createNonceCheckRequest(
  permit: PermitData,
  requestId: number
): { request: JsonRpcRequest; key: string; type: string; chainId: number } {
  const owner = permit.owner as Address;
  const wordPos = BigInt(permit.nonce) >> 8n;
  
  return {
    request: {
      jsonrpc: "2.0",
      method: "eth_call",
      params: [
        { to: permit.permit2Address, data: encodeFunctionData({ abi: [permit2Abi], functionName: "nonceBitmap", args: [owner, wordPos] }) },
        "latest",
      ],
      id: requestId,
    },
    key: permit.signature,
    type: "nonce",
    chainId: permit.networkId,
  };
}

// Helper function to create balance check request
function createBalanceCheckRequest(
  balanceKey: string,
  tokenAddress: `0x${string}`,
  ownerAddress: `0x${string}`,
  chainId: number,
  requestId: number
): { request: JsonRpcRequest; key: string; type: string; chainId: number } {
  return {
    request: {
      jsonrpc: "2.0",
      method: "eth_call",
      params: [
        {
          to: tokenAddress,
          data: encodeFunctionData({ abi: erc20Abi, functionName: "balanceOf", args: [ownerAddress] }),
        },
        "latest",
      ],
      id: requestId,
    },
    key: balanceKey,
    type: "balance",
    chainId,
  };
}

// Helper function to create allowance check request
function createAllowanceCheckRequest(
  balanceKey: string,
  tokenAddress: `0x${string}`,
  ownerAddress: `0x${string}`,
  permit2Address: `0x${string}`,
  chainId: number,
  requestId: number
): { request: JsonRpcRequest; key: string; type: string; chainId: number } {
  return {
    request: {
      jsonrpc: "2.0",
      method: "eth_call",
      params: [
        {
          to: tokenAddress,
          data: encodeFunctionData({ abi: erc20Abi, functionName: "allowance", args: [ownerAddress, permit2Address] }),
        },
        "latest",
      ],
      id: requestId,
    },
    key: balanceKey,
    type: "allowance",
    chainId,
  };
}

// Helper function to handle nonce check response
function handleNonceCheckResponse(
  batchReq: { request: JsonRpcRequest; key: string; type: string; chainId: number },
  res: JsonRpcResponse | undefined,
  permitsByKey: Map<string, PermitData>,
  checkedPermitsMap: Map<string, Partial<PermitData & { isNonceUsed?: boolean }>>
): void {
  const permit = permitsByKey.get(batchReq.key);
  if (!permit) return;

  const updateData: Partial<PermitData & { isNonceUsed?: boolean }> = checkedPermitsMap.get(batchReq.key) || {};

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
}

// Helper function to process balance/allowance result value
function processBalanceAllowanceResult(
  resultValue: bigint,
  type: string,
  balanceAllowanceData: AllowanceAndBalance
): void {
  if (type === "balance") {
    balanceAllowanceData.balance = resultValue;
  } else {
    balanceAllowanceData.allowance = resultValue;
  }
}

// Helper function to update max claimable amount
function updateMaxClaimable(balanceAllowanceData: AllowanceAndBalance): void {
  if (balanceAllowanceData.balance !== undefined && balanceAllowanceData.allowance !== undefined && !balanceAllowanceData.error) {
    balanceAllowanceData.maxClaimable =
      balanceAllowanceData.balance < balanceAllowanceData.allowance ? balanceAllowanceData.balance : balanceAllowanceData.allowance;
  }
}

// Helper function to handle balance/allowance check response
function handleBalanceAllowanceResponse(
  batchReq: { request: JsonRpcRequest; key: string; type: string; chainId: number },
  res: JsonRpcResponse | undefined,
  balancesAndAllowances: Map<string, AllowanceAndBalance>
): void {
  const balanceKey = batchReq.key;
  const balanceAllowanceData = balancesAndAllowances.get(balanceKey);
  if (!balanceAllowanceData) return;

  if (!res) {
    balanceAllowanceData.error = `Batch response missing (${batchReq.type})`;
  } else if (res.error) {
    balanceAllowanceData.error = `Check failed (${batchReq.type}). ${res.error.message}`;
  } else if (res.result !== undefined && res.result !== null) {
    try {
      const resultValue = BigInt(res.result as string);
      processBalanceAllowanceResult(resultValue, batchReq.type, balanceAllowanceData);
    } catch (parseError: unknown) {
      balanceAllowanceData.error = `Result parse error (${batchReq.type}). ${parseError instanceof Error ? parseError.message : String(parseError)}`;
    }
  } else {
    balanceAllowanceData.error = `Empty result (${batchReq.type})`;
  }
  
  updateMaxClaimable(balanceAllowanceData);
  balancesAndAllowances.set(balanceKey, balanceAllowanceData);
}

// Helper function to process permits and create batch requests
function createBatchRequestsForNetwork(
  permits: PermitData[],
  networkId: number,
  balancesAndAllowances: Map<string, AllowanceAndBalance>
): { request: JsonRpcRequest; key: string; type: string; requiredAmount?: bigint; chainId: number }[] {
  let requestIdCounter = 1;
  const batchRequests: { request: JsonRpcRequest; key: string; type: string; requiredAmount?: bigint; chainId: number }[] = [];

  permits.forEach((permit) => {
    // Only handle ERC20 permits as per simplified logic
    if (permit.type !== "erc20-permit") {
      return;
    }

    const owner = permit.owner as Address;

    // Nonce Check (ERC20 only)
    batchRequests.push(createNonceCheckRequest(permit, requestIdCounter++));

    // Group Balance & Allowance Checks by unique tuple
    if (permit.token?.address && permit.amount && permit.owner) {
      const balanceKey = `${networkId}-${permit.permit2Address}-${permit.token.address}-${permit.owner}`;
      const ownerAddress = permit.owner as `0x${string}`;
      const tokenAddress = permit.token.address as `0x${string}`;
      if (!balancesAndAllowances.has(balanceKey)) {
        batchRequests.push(createBalanceCheckRequest(balanceKey, tokenAddress, ownerAddress, permit.networkId, requestIdCounter++));
        batchRequests.push(createAllowanceCheckRequest(balanceKey, tokenAddress, ownerAddress, permit.permit2Address, permit.networkId, requestIdCounter++));

        balancesAndAllowances.set(balanceKey, { networkId, permit2Address: permit.permit2Address, tokenAddress: permit.token.address, owner });
      }
    }
  });

  return batchRequests;
}

// Helper function to apply balance and allowance results to permits
function applyBalanceAllowanceResults(
  permits: PermitData[],
  networkId: number,
  balancesAndAllowances: Map<string, AllowanceAndBalance>,
  checkedPermitsMap: Map<string, Partial<PermitData & { isNonceUsed?: boolean }>>
): void {
  permits.forEach((permit) => {
    if (permit.type !== "erc20-permit" || !permit.token?.address || !permit.owner) {
      return;
    }

    const balanceKey = `${networkId}-${permit.permit2Address}-${permit.token.address}-${permit.owner}`;
    const balanceAllowanceData = balancesAndAllowances.get(balanceKey);

    if (balanceAllowanceData) {
      const updateData: Partial<PermitData & { isNonceUsed?: boolean }> = checkedPermitsMap.get(permit.signature) || {};

      if (balanceAllowanceData.error) {
        updateData.checkError = balanceAllowanceData.error;
      } else {
        if (balanceAllowanceData.balance !== undefined) {
          updateData.ownerBalanceSufficient = balanceAllowanceData.balance >= permit.amount;
        }
        if (balanceAllowanceData.allowance !== undefined) {
          updateData.permit2AllowanceSufficient = balanceAllowanceData.allowance >= permit.amount;
        }
      }
      checkedPermitsMap.set(permit.signature, updateData);
    }
  });
}

// Helper function to process batch responses
function processBatchResponses(
  batchRequests: { request: JsonRpcRequest; key: string; type: string; chainId: number }[],
  batchResponses: JsonRpcResponse[],
  permitsByKey: Map<string, PermitData>,
  checkedPermitsMap: Map<string, Partial<PermitData & { isNonceUsed?: boolean }>>,
  balancesAndAllowances: Map<string, AllowanceAndBalance>
): void {
  const responseMap = new Map<number, JsonRpcResponse>(batchResponses.map((res) => [res.id as number, res]));

  batchRequests.forEach((batchReq) => {
    const res = responseMap.get(batchReq.request.id as number);

    if (batchReq.type === "nonce") {
      handleNonceCheckResponse(batchReq, res, permitsByKey, checkedPermitsMap);
    } else if (batchReq.type === "balance" || batchReq.type === "allowance") {
      handleBalanceAllowanceResponse(batchReq, res, balancesAndAllowances);
    }
  });
}

// Function to perform batch validation using rpcClient
async function validatePermitsBatch(permitsToValidate: PermitData[]) {
  if (!rpcClient) throw new Error("RPC client not initialized.");
  if (permitsToValidate.length === 0) {
    return { permits: [], balancesAndAllowances: new Map<string, AllowanceAndBalance>() };
  }

  const checkedPermitsMap = new Map<string, Partial<PermitData & { isNonceUsed?: boolean }>>();
  const balancesAndAllowances = new Map<string, AllowanceAndBalance>();
  const permitsByKey = new Map<string, PermitData>(permitsToValidate.map((p) => [p.signature, p]));

  const permitsByNetwork = permitsToValidate.reduce((map, permit) => {
    const networkPermits = map.get(permit.networkId) || [];
    networkPermits.push(permit);
    map.set(permit.networkId, networkPermits);
    return map;
  }, new Map<number, PermitData[]>());

  for (const [networkId, permits] of permitsByNetwork.entries()) {
    const batchRequests = createBatchRequestsForNetwork(permits, networkId, balancesAndAllowances);

    if (batchRequests.length === 0) continue; // Return original if nothing to check (e.g., only non-ERC20 passed)

    try {
      const batchPayload = batchRequests.map((br) => br.request);
      const batchResponses = (await rpcClient.request(networkId, batchPayload)) as JsonRpcResponse[];
      processBatchResponses(batchRequests, batchResponses, permitsByKey, checkedPermitsMap, balancesAndAllowances);

      // Apply balance/allowance results to all permits that share the same tuple
      applyBalanceAllowanceResults(permits, networkId, balancesAndAllowances, checkedPermitsMap);
    } catch (error: unknown) {
      console.error("Worker: Error during validation batch RPC request:", error);
      // Mark all permits in this validation batch as errored
      permitsToValidate.forEach((permit) => {
        const updateData = checkedPermitsMap.get(permit.signature) || {
          checkError: `Batch request failed: ${error instanceof Error ? error.message : String(error)}`,
        };
        if (!updateData.checkError) {
          // Don't overwrite specific check errors
          updateData.checkError = `Batch request failed: ${error instanceof Error ? error.message : String(error)}`;
        }
        checkedPermitsMap.set(permit.signature, updateData);
      });
    }
  }

  // Enrich permits with validation data by signature and dedupe by nonce
  const finalPermits = permitsToValidate.map((permit) => {
    const checkData = checkedPermitsMap.get(permit.signature);
    return checkData ? { ...permit, ...checkData } : permit;
  });

  const permitsByNonce = finalPermits.reduce((map, p) => {
    const list = map.get(p.nonce) || [];
    list.push(p);
    map.set(p.nonce, list);
    return map;
  }, new Map<string, PermitData[]>());

  // DEBUG: Log nonce deduplication information
  console.log("=== NONCE DEDUPLICATION DEBUG ===");
  console.log("Total permits before deduplication:", finalPermits.length);
  console.log("Unique nonces found:", permitsByNonce.size);
  console.log("Nonce groups with multiple permits:", Array.from(permitsByNonce.values()).filter(group => group.length > 1).length);
  
  // Log a few examples of nonce groups
  let groupCount = 0;
  for (const [nonce, group] of permitsByNonce.entries()) {
    if (groupCount < 3) { // Show first 3 nonce groups as examples
      console.log(`Nonce group ${groupCount + 1}: nonce=${nonce.substring(0, 10)}..., permits=${group.length}`);
      group.forEach((permit, i) => {
        console.log(`  Permit ${i + 1}: amount=${permit.amount}, signature=${permit.signature.substring(0, 10)}..., error=${permit.checkError || 'none'}`);
      });
    }
    groupCount++;
    if (groupCount >= 3) break;
  }

  // FIXED: check duplicated permits by nonce (only process groups with multiple permits)
  for (const nonceGroup of permitsByNonce.values()) {
    // Only process nonce groups that actually have multiple permits
    if (nonceGroup.length > 1) {
      console.log(`Processing nonce group with ${nonceGroup.length} permits`);
      
      // Sort by amount descending, then find the best permit without errors
      const sortedByAmountDescending = nonceGroup.slice().sort((a, b) => {
        const diff = b.amount - a.amount;
        if (diff > 0n) return 1;
        if (diff < 0n) return -1;
        return 0;
      });
      
      // Find the permit with highest amount and no existing error
      const passing = sortedByAmountDescending.find((p) => !p.checkError);
      
      if (passing) {
        console.log(`Selected permit with amount ${passing.amount} as the valid one for nonce group`);
        
        // Mark all OTHER permits in this nonce group as duplicates
        nonceGroup.forEach((p) => {
          if (!p.checkError && p.signature !== passing.signature) {
            p.checkError = "permit with same nonce but higher amount exists";
            console.log(`Marked permit ${p.signature.substring(0, 10)}... as duplicate`);
          }
        });
      } else {
        console.log(`No valid permit found in nonce group - all have errors`);
      }
    }
  }

  // set status to "Valid" for permits that passed all checks
  finalPermits.forEach((p) => {
    if (!p.checkError && p.status === undefined) {
      p.status = "Valid";
    }
  });

  return { permits: finalPermits, balancesAndAllowances };
}

// --- Worker Message Handling ---

// Helper function to handle worker initialization
function handleWorkerInit(payload: { supabaseUrl: string; supabaseAnonKey: string; isDevelopment: boolean }): void {
  const supabaseUrl = payload.supabaseUrl;
  const supabaseAnonKey = payload.supabaseAnonKey;
  PROXY_BASE_URL = payload.isDevelopment ? "https://rpc.ubq.fi" : `${self.location.origin}/rpc`;

  if (supabaseUrl && supabaseAnonKey) {
    try {
      supabase = createClient<Database>(supabaseUrl, supabaseAnonKey); // Use Database type
      rpcClient = createRpcClient({ baseUrl: PROXY_BASE_URL }); // Init RPC client here
      worker.postMessage({ type: "INIT_SUCCESS" });
    } catch (error: unknown) {
      console.error("Worker: Error initializing clients:", error);
      worker.postMessage({ type: "INIT_ERROR", error: error instanceof Error ? error.message : String(error) });
    }
  } else {
    worker.postMessage({ type: "INIT_ERROR", error: "Missing supabaseUrl or supabaseAnonKey" });
  }
}

// Helper function to handle fetching new permits
async function handleFetchNewPermits(payload: { address: Address; lastCheckTimestamp?: string | null }): Promise<void> {
  const address = payload.address as Address;
  const lastCheckTimestamp = payload.lastCheckTimestamp;
  
  console.log("=== WORKER FETCH_NEW_PERMITS CALLED ===");
  console.log("Address:", address);
  console.log("lastCheckTimestamp:", lastCheckTimestamp);
  console.log("Timestamp is null/undefined:", lastCheckTimestamp == null);
  
  try {
    if (!supabase) throw new Error("Supabase client not ready.");
    const lowerCaseWalletAddress = address.toLowerCase();

    // Fetch *only new* permits from DB using the wallet address and timestamp
    const newPermitsFromDb = await fetchPermitsFromDb(lowerCaseWalletAddress, lastCheckTimestamp ?? null);

    // Map and pre-filter *new* permits
    console.log("=== PERMIT MAPPING DEBUG ===");
    console.log("Raw permits from DB:", newPermitsFromDb.length);
    
    const mappedNewPermits = (
      await Promise.all(newPermitsFromDb.map((p: PermitRow, i: number) => mapDbPermitToPermitData(p, i, lowerCaseWalletAddress)))
    ).filter((p): p is PermitData => p !== null);
    
    console.log("Mapped permits:", mappedNewPermits.length);
    if (mappedNewPermits.length > 0) {
      console.log("Sample mapped permit:", {
        nonce: mappedNewPermits[0].nonce,
        amount: mappedNewPermits[0].amount.toString(),
        networkId: mappedNewPermits[0].networkId,
        beneficiary: mappedNewPermits[0].beneficiary,
        owner: mappedNewPermits[0].owner
      });
    }
    
    // Summary logging instead of individual warnings
    if (mappedNewPermits.length < newPermitsFromDb.length) {
      const invalidCount = newPermitsFromDb.length - mappedNewPermits.length;
      console.info(`Worker: Filtered out ${invalidCount} invalid permits from ${newPermitsFromDb.length} total`);

      if (DEBUG_MODE) {
        // Only in debug mode, show breakdown
        console.debug("Invalid permit breakdown:", {
          total: newPermitsFromDb.length,
          valid: mappedNewPermits.length,
          invalid: invalidCount,
        });
      }
    } else if (mappedNewPermits.length > 0) {
      console.info(`Worker: Mapped ${mappedNewPermits.length} new permits`);
    } else {
      console.info("Worker: No new permits to map");
    }

    if (mappedNewPermits.length === 0) {
      worker.postMessage({ type: "NEW_PERMITS_VALIDATED", permits: [], balancesAndAllowances: new Map() });
      return;
    }

    const result = await validatePermitsBatch(mappedNewPermits);
    
    console.log("=== FINAL WORKER RESULT ===");
    console.log("Validated permits count:", result.permits.length);
    console.log("Balances and allowances count:", result.balancesAndAllowances.size);
    if (result.permits.length > 0) {
      console.log("Sample validated permit:", {
        nonce: result.permits[0].nonce,
        amount: result.permits[0].amount.toString(),
        status: result.permits[0].status,
        checkError: result.permits[0].checkError
      });
    }
    console.log("Sending NEW_PERMITS_VALIDATED message to frontend...");
    
    worker.postMessage({ type: "NEW_PERMITS_VALIDATED", permits: result.permits, balancesAndAllowances: result.balancesAndAllowances });
  } catch (error: unknown) {
    console.error("[Worker] Error fetching new permits:", error);
    worker.postMessage({ type: "PERMITS_ERROR", error: error instanceof Error ? error.message : String(error) });
  }
}

worker.onmessage = async (event) => {
  const { type, payload } = event.data;

  if (type === "INIT") {
    handleWorkerInit(payload);
  } else if (type === "FETCH_NEW_PERMITS") {
    await handleFetchNewPermits(payload);
  }
};
