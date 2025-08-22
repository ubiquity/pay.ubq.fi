import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { createRpcClient, type JsonRpcResponse } from "@ubiquity-dao/permit2-rpc-client";
import { PermitTransferFrom, SignatureTransfer } from "@uniswap/permit2-sdk";
import { type Abi, type Address, encodeFunctionData, parseAbiItem, recoverAddress } from "viem";
import { NEW_PERMIT2_ADDRESS, OLD_PERMIT2_ADDRESS } from "../constants/config.ts";
import type { Database, Tables } from "../database.types.ts"; // Import generated types
import type { PermitData } from "../types.ts";
import { preparePermitPrerequisiteContracts } from "../utils/permit-utils.ts";

// --- Worker Setup ---

type WorkerResponse =
  | { type: "INIT_SUCCESS" }
  | { type: "INIT_ERROR"; error: string }
  | { type: "NEW_PERMITS_VALIDATED"; permits: PermitData[] }
  | { type: "PERMITS_ERROR"; error: string };

// Define the worker scope type
interface WorkerGlobalScope {
  onmessage: (event: MessageEvent) => void;
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

// Define expected message structure more specifically if possible
interface WorkerPayload {
  supabaseUrl?: string;
  supabaseAnonKey?: string;
  address?: Address;
  lastCheckTimestamp?: string | null;
  permits?: PermitData[]; // For VALIDATE_PERMITS
  isDevelopment: boolean;
  [key: string]: unknown;
}

// --- Database Fetching and Mapping ---

// Type alias for permits row using generated types
type PermitRow = Tables<"permits"> & {
  token: Tables<"tokens"> | null;
  partner: (Tables<"partners"> & { wallet: Tables<"wallets"> | null }) | null;
  location: Tables<"locations"> | null;
};

// Function to map DB result to PermitData (ERC20 only focus)
function mapDbPermitToPermitData(permit: PermitRow, index: number, lowerCaseWalletAddress: string): PermitData | null {
  const tokenData = permit.token;
  const ownerWalletData = permit.partner?.wallet;
  const ownerAddressStr = ownerWalletData?.address ? String(ownerWalletData.address) : "";
  const tokenAddressStr = tokenData?.address ? String(tokenData.address) : undefined;
  const networkIdNum = Number(tokenData?.network ?? 0);
  const githubUrlStr = permit.location?.node_url ? String(permit.location.node_url) : "";

  // Assume ERC20 if amount is positive, otherwise filter out.
  let type: "erc20-permit" | null = null;
  let amountBigInt: bigint | null = null;
  if (permit.amount !== undefined && permit.amount !== null) {
    try {
      amountBigInt = BigInt(permit.amount);
    } catch {
      console.warn(`Worker: Permit [${index}] with nonce ${permit.nonce} has invalid amount format: ${permit.amount}`);
      amountBigInt = null;
    }
  }

  if (permit.amount === "0" || (amountBigInt !== null && amountBigInt > 0n)) {
    type = "erc20-permit";
  }

  if (!type) {
    return null;
  }

  const permitData: PermitData = {
    nonce: String(permit.nonce),
    networkId: networkIdNum,
    beneficiary: lowerCaseWalletAddress, // Keep wallet address as beneficiary for UI/logic consistency
    deadline: String(permit.deadline),
    signature: String(permit.signature),
    type: type,
    owner: ownerAddressStr,
    tokenAddress: tokenAddressStr,
    token: tokenAddressStr ? { address: tokenAddressStr, network: networkIdNum } : undefined,
    amount: permit.amount !== undefined && permit.amount !== null ? String(permit.amount) : undefined,
    token_id: permit.token_id !== undefined && permit.token_id !== null ? Number(permit.token_id) : undefined,
    githubCommentUrl: githubUrlStr,
    partner: ownerAddressStr ? { wallet: { address: ownerAddressStr } } : undefined,
    claimStatus: "Idle",
    status: "Fetching",
    permit2Address: "0x", // Default value, will be updated in validation
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

  // Query for permits where user can claim (beneficiary)
  const directJoinQuery = `
              *,
              token:${TOKENS_TABLE}(address, network),
              partner:${PARTNERS_TABLE}(wallet:${WALLETS_TABLE}(address)),
              location:${LOCATIONS_TABLE}(node_url),
              users!inner(
                  wallets!inner(address)
              )
    `;

  let beneficiaryQuery = supabase.from(PERMITS_TABLE).select(directJoinQuery).is("transaction", null).filter("users.wallets.address", "ilike", normalizedWalletAddress);

  if (lastCheckTimestamp && !isNaN(Date.parse(lastCheckTimestamp))) {
    beneficiaryQuery = beneficiaryQuery.gt("created", lastCheckTimestamp);
  }

  const beneficiaryResult = await beneficiaryQuery;

  if (beneficiaryResult.error) {
    console.error(`Worker: beneficiary query error: ${beneficiaryResult.error.message}`, beneficiaryResult.error);
  } else if (beneficiaryResult.data && beneficiaryResult.data.length > 0) {
    console.log(`Worker: Found ${beneficiaryResult.data.length} permits as beneficiary`);
    permitsData = beneficiaryResult.data;
  }

  // Query for permits where user is the owner (funding wallet)
  const ownerJoinQuery = `
              *,
              token:${TOKENS_TABLE}(address, network),
              partner:${PARTNERS_TABLE}(wallet:${WALLETS_TABLE}(address)),
              location:${LOCATIONS_TABLE}(node_url),
              users(
                  wallets(address)
              )
    `;

  let ownerQuery = supabase.from(PERMITS_TABLE).select(ownerJoinQuery).is("transaction", null).filter("partner.wallet.address", "ilike", normalizedWalletAddress);

  if (lastCheckTimestamp && !isNaN(Date.parse(lastCheckTimestamp))) {
    ownerQuery = ownerQuery.gt("created", lastCheckTimestamp);
  }

  const ownerResult = await ownerQuery;

  if (ownerResult.error) {
    console.error(`Worker: owner query error: ${ownerResult.error.message}`, ownerResult.error);
  } else if (ownerResult.data && ownerResult.data.length > 0) {
    console.log(`Worker: Found ${ownerResult.data.length} permits as owner`);
    // Combine both results
    permitsData = [...permitsData, ...ownerResult.data];
  }

  if (permitsData.length === 0) {
    return [];
  }

  // Remove duplicates based on permit ID
  const uniquePermits = new Map<number, unknown>();
  permitsData.forEach((permit: any) => {
    if (permit.id && !uniquePermits.has(permit.id)) {
      uniquePermits.set(permit.id, permit);
    }
  });

  // Cast needed because Supabase client doesn't know about the joined types automatically
  return Array.from(uniquePermits.values()) as unknown as PermitRow[];
}

// --- On-Chain Validation ---

async function getPermit2Address(permitData: PermitData) {
  const permit: PermitTransferFrom = {
    permitted: {
      token: permitData.tokenAddress as Address,
      amount: BigInt(permitData.amount ?? 0),
    },
    nonce: BigInt(permitData.nonce),
    deadline: BigInt(permitData.deadline),
    spender: permitData.beneficiary as Address,
  };
  const hash = SignatureTransfer.hash(permit, NEW_PERMIT2_ADDRESS, permitData.networkId) as `0x${string}`;
  const signer = await recoverAddress({ hash, signature: permitData.signature as `0x${string}` });
  if (signer.toLowerCase() === permitData.owner.toLowerCase()) {
    return NEW_PERMIT2_ADDRESS;
  }
  // If the signer doesn't match, fallback to old permit address
  return OLD_PERMIT2_ADDRESS;
}

// Function to perform batch validation using rpcClient
async function validatePermitsBatch(permitsToValidate: PermitData[]): Promise<PermitData[]> {
  if (!rpcClient) throw new Error("RPC client not initialized.");
  if (permitsToValidate.length === 0) {
    return [];
  }

  await Promise.all(
    permitsToValidate.map(async (permit) => {
      permit.permit2Address = await getPermit2Address(permit);
    })
  );

  const checkedPermitsMap = new Map<string, Partial<PermitData & { isNonceUsed?: boolean }>>();
  const batchRequests: { request: JsonRpcRequest; key: string; type: string; requiredAmount?: bigint; chainId: number }[] = [];
  let requestIdCounter = 1;
  const permitsByKey = new Map<string, PermitData>(permitsToValidate.map((p) => [p.signature, p]));

  permitsToValidate.forEach((permit) => {
    // Only handle ERC20 permits as per simplified logic
    if (permit.type !== "erc20-permit") {
      return;
    }

    const key = permit.signature;
    const chainId = permit.networkId;
    const owner = permit.owner as Address;

    // Nonce Check (ERC20 only)
    const wordPos = BigInt(permit.nonce) >> 8n;
    batchRequests.push({
      request: {
        jsonrpc: "2.0",
        method: "eth_call",
        params: [{ to: permit.permit2Address, data: encodeFunctionData({ abi: [permit2Abi], functionName: "nonceBitmap", args: [owner, wordPos] }) }, "latest"],
        id: requestIdCounter++,
      },
      key,
      type: "nonce",
      chainId,
    });

    // Balance & Allowance Checks
    if (permit.token?.address && permit.amount && permit.owner) {
      const calls = preparePermitPrerequisiteContracts(permit);
      if (calls) {
        const requiredAmount = BigInt(permit.amount);
        const [balanceCall, allowanceCall] = calls;
        batchRequests.push({
          request: {
            jsonrpc: "2.0",
            method: "eth_call",
            params: [
              {
                to: balanceCall.address,
                data: encodeFunctionData({ abi: balanceCall.abi as Abi, functionName: balanceCall.functionName, args: balanceCall.args }),
              },
              "latest",
            ],
            id: requestIdCounter++,
          },
          key,
          type: "balance",
          requiredAmount,
          chainId,
        });
        batchRequests.push({
          request: {
            jsonrpc: "2.0",
            method: "eth_call",
            params: [
              {
                to: allowanceCall.address,
                data: encodeFunctionData({ abi: allowanceCall.abi as Abi, functionName: allowanceCall.functionName, args: allowanceCall.args }),
              },
              "latest",
            ],
            id: requestIdCounter++,
          },
          key,
          type: "allowance",
          requiredAmount,
          chainId,
        });
      }
    }
  });

  if (batchRequests.length === 0) return permitsToValidate; // Return original if nothing to check (e.g., only non-ERC20 passed)

  try {
    const batchPayload = batchRequests.map((br) => br.request);
    // Assuming same chainId for all permits currently
    const batchResponses = (await rpcClient.request(batchRequests[0].chainId, batchPayload)) as JsonRpcResponse[];

    const responseMap = new Map<number, JsonRpcResponse>(batchResponses.map((res) => [res.id as number, res]));

    batchRequests.forEach((batchReq) => {
      const permit = permitsByKey.get(batchReq.key);
      if (!permit) return;

      const res = responseMap.get(batchReq.request.id as number);
      // Initialize updateData with existing permit data to preserve fields not checked
      const updateData: Partial<PermitData & { isNonceUsed?: boolean }> = checkedPermitsMap.get(batchReq.key) || {};

      if (!res) {
        updateData.checkError = `Batch response missing (${batchReq.type})`;
      } else if (res.error) {
        updateData.checkError = `Check failed (${batchReq.type}). ${res.error.message}`;
      } else if (res.result !== undefined && res.result !== null) {
        try {
          if (batchReq.type === "balance" && batchReq.requiredAmount !== undefined)
            updateData.ownerBalanceSufficient = BigInt(res.result as string) >= batchReq.requiredAmount;
          else if (batchReq.type === "allowance" && batchReq.requiredAmount !== undefined)
            updateData.permit2AllowanceSufficient = BigInt(res.result as string) >= batchReq.requiredAmount;
          else if (batchReq.type === "nonce") {
            const bitmap = BigInt(res.result as string);
            updateData.isNonceUsed = Boolean(bitmap & (1n << (BigInt(permit.nonce) & 255n)));
            updateData.status = updateData.isNonceUsed ? "Claimed" : "Valid";
          }
          // Clear checkError if this specific check succeeded
          if (updateData.checkError?.includes(`(${batchReq.type})`)) {
            updateData.checkError = undefined;
          }
        } catch (parseError: unknown) {
          updateData.checkError = `Result parse error (${batchReq.type}). ${parseError instanceof Error ? parseError.message : String(parseError)}`;
        }
      } else {
        updateData.checkError = `Empty result (${batchReq.type})`;
      }
      checkedPermitsMap.set(batchReq.key, updateData);
    });
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

  // check duplicated permits by nonce
  for (const nonceGroup of permitsByNonce.values()) {
    const sortedByAmountDescending = nonceGroup.slice().sort((a, b) => {
      const diff = BigInt(b.amount || "0") - BigInt(a.amount || "0");
      return diff > 0n ? 1 : diff < 0n ? -1 : 0;
    });
    const passing = sortedByAmountDescending.find((p) => !p.checkError); // find the permit with highest amount and no error
    if (passing) {
      nonceGroup.forEach((p) => {
        if (!p.checkError && p.signature !== passing.signature) {
          p.checkError = "permit with same nonce but higher amount exists";
        }
      });
    }
  }

  // set status to "Valid" for permits that passed all checks
  finalPermits.forEach((p) => {
    if (!p.checkError && p.status === undefined) {
      p.status = "Valid";
    }
  });

  return finalPermits;
}

// --- Worker Message Handling ---

worker.onmessage = async (event: MessageEvent<{ type: "INIT" | "FETCH_NEW_PERMITS" | "VALIDATE_PERMITS"; payload: WorkerPayload }>) => {
  const { type, payload } = event.data;

  if (type === "INIT") {
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
      worker.postMessage({ type: "INIT_ERROR", error: "Supabase/RPC credentials not received by worker." });
    }
  } else if (type === "FETCH_NEW_PERMITS") {
    const address = payload.address as Address;
    const lastCheckTimestamp = payload.lastCheckTimestamp;
    try {
      if (!supabase) throw new Error("Supabase client not ready.");
      const lowerCaseWalletAddress = address.toLowerCase();

      // Fetch *only new* permits from DB using the wallet address and timestamp
      const newPermitsFromDb = await fetchPermitsFromDb(lowerCaseWalletAddress, lastCheckTimestamp ?? null);

      // 3. Map and pre-filter *new* permits
      // Add explicit types to map parameters
      const mappedNewPermits = newPermitsFromDb
        .map((p: PermitRow, i: number) => mapDbPermitToPermitData(p, i, lowerCaseWalletAddress))
        .filter((p): p is PermitData => p !== null);
      // One-line summary for mapped permits
      console.log(`Worker: Mapped ${mappedNewPermits.length} new permits`);

      // 4. Validate *only* the mapped new permits
      if (mappedNewPermits.length > 0) {
        const validatedNewPermits = await validatePermitsBatch(mappedNewPermits);
        worker.postMessage({ type: "NEW_PERMITS_VALIDATED", permits: validatedNewPermits });
      } else {
        // If no new permits were found, still send back an empty array for consistency
        worker.postMessage({ type: "NEW_PERMITS_VALIDATED", permits: [] });
      }
    } catch (error: unknown) {
      console.error("Worker: Error fetching/validating new permits:", error);
      worker.postMessage({ type: "PERMITS_ERROR", error: error instanceof Error ? error.message : String(error) });
    }
  } else if (type === "VALIDATE_PERMITS") {
    // This message type might become obsolete with the new flow, but keep for now? Or remove? Let's remove for now.
    // This case is handled internally now after fetching new permits.
    console.warn("Worker: Received unexpected VALIDATE_PERMITS message.");
    // Optionally handle if needed, otherwise ignore.
  }
};
