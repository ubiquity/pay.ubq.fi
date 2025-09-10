import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { createRpcClient, type JsonRpcResponse } from "@ubiquity-dao/permit2-rpc-client";
import { PermitTransferFrom, SignatureTransfer } from "@uniswap/permit2-sdk";
import { type Address, encodeFunctionData, erc20Abi, parseAbiItem, recoverAddress } from "viem";
import { PERMIT3_ADDRESS, NEW_PERMIT2_ADDRESS, OLD_PERMIT2_ADDRESS } from "../constants/config.ts";
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
const permit3Abi = parseAbiItem("function nonceBitmap(address owner, uint256 wordPos) view returns (uint256)");

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

// Function to map DB result to PermitData (ERC20 only focus)
async function mapDbPermitToPermitData(permit: PermitRow, index: number, lowerCaseWalletAddress: string): Promise<PermitData | null> {
  const tokenData = permit.token;
  const ownerWalletData = permit.partner?.wallet;
  const ownerAddressStr = ownerWalletData?.address ? String(ownerWalletData.address) : "";
  if (!ownerAddressStr) {
    console.warn(`Worker: Permit [${index}] with nonce ${permit.nonce} has no owner address`);
    return null;
  }
  const tokenAddressStr = tokenData?.address ? String(tokenData.address) : undefined;
  if (!tokenAddressStr) {
    console.warn(`Worker: Permit [${index}] with nonce ${permit.nonce} has no token address`);
    return null;
  }
  const networkIdNum = Number(tokenData?.network ?? 0);
  if (networkIdNum === 0) {
    console.warn(`Worker: Permit [${index}] with nonce ${permit.nonce} has invalid network ID: ${tokenData?.network}`);
    return null;
  }
  if (!permit.deadline) {
    console.warn(`Worker: Permit [${index}] with nonce ${permit.nonce} has no deadline`);
    return null;
  }
  if (!permit.signature || !permit.signature.startsWith("0x")) {
    console.warn(`Worker: Permit [${index}] with nonce ${permit.nonce} has invalid signature format: ${permit.signature}`);
    return null;
  }

  const githubUrlStr = permit.location?.node_url ? String(permit.location.node_url) : "";

  if (permit.amount !== undefined && permit.amount !== null) {
    try {
      BigInt(permit.amount);
    } catch {
      console.warn(`Worker: Permit [${index}] with nonce ${permit.nonce} has invalid amount format: ${permit.amount}`);
      return null;
    }
  }

  const permit3Address = await getPermit3Address({
    nonce: permit.nonce,
    tokenAddress: tokenAddressStr ?? "",
    amount: permit.amount,
    deadline: String(permit.deadline),
    beneficiary: lowerCaseWalletAddress,
    owner: ownerAddressStr,
    signature: String(permit.signature),
    networkId: networkIdNum,
  });

  const permitData: PermitData = {
    permit2Address: permit3Address as `0x${string}`,
    nonce: String(permit.nonce),
    networkId: networkIdNum,
    beneficiary: lowerCaseWalletAddress, // Keep wallet address as beneficiary for UI/logic consistency
    deadline: String(permit.deadline),
    signature: String(permit.signature),
    type: "erc20-permit",
    owner: ownerAddressStr,
    tokenAddress: tokenAddressStr,
    token: tokenAddressStr ? { address: tokenAddressStr, network: networkIdNum } : undefined,
    amount: BigInt(permit.amount),
    token_id: permit.token_id !== undefined && permit.token_id !== null ? Number(permit.token_id) : undefined,
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

  // This query directly joins permits with users and wallets
  const directJoinQuery = `
              *,
              token:${TOKENS_TABLE}(address, network),
              partner:${PARTNERS_TABLE}(wallet:${WALLETS_TABLE}(address)),
              location:${LOCATIONS_TABLE}(node_url),
              users!inner(
                  wallets!inner(address)
              )
    `;

  let query = supabase.from(PERMITS_TABLE).select(directJoinQuery).is("transaction", null).filter("users.wallets.address", "ilike", normalizedWalletAddress);

  if (lastCheckTimestamp && !isNaN(Date.parse(lastCheckTimestamp))) {
    query = query.gt("created", lastCheckTimestamp);
  }

  const result = await query;

  if (result.error) {
    console.error(`Worker: query error: ${result.error.message}`, result.error);
  } else if (result.data && result.data.length > 0) {
    console.log(`Worker: Found ${result.data.length} permits`);
    permitsData = result.data;
  }

  if (permitsData.length === 0) {
    return [];
  }

  // Cast needed because Supabase client doesn't know about the joined types automatically
  return permitsData as unknown as PermitRow[];
}

// --- On-Chain Validation ---

async function getPermit3Address(permitData: {
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
  const hash = SignatureTransfer.hash(permit, PERMIT3_ADDRESS, permitData.networkId) as `0x${string}`;
  const signer = await recoverAddress({ hash, signature: permitData.signature as `0x${string}` });
  if (signer.toLowerCase() === permitData.owner.toLowerCase()) {
    return PERMIT3_ADDRESS;
  }
  // Try NEW_PERMIT2_ADDRESS as fallback
  const hashPermit2 = SignatureTransfer.hash(permit, NEW_PERMIT2_ADDRESS, permitData.networkId) as `0x${string}`;
  const signerPermit2 = await recoverAddress({ hash: hashPermit2, signature: permitData.signature as `0x${string}` });
  if (signerPermit2.toLowerCase() === permitData.owner.toLowerCase()) {
    return NEW_PERMIT2_ADDRESS;
  }
  // If neither matches, fallback to old permit address
  return OLD_PERMIT2_ADDRESS;
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
    let requestIdCounter = 1;
    const batchRequests: { request: JsonRpcRequest; key: string; type: string; requiredAmount?: bigint; chainId: number }[] = [];

    permits.forEach((permit) => {
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
          params: [
            { to: permit.permit2Address, data: encodeFunctionData({ abi: [permit3Abi], functionName: "nonceBitmap", args: [owner, wordPos] }) },
            "latest",
          ],
          id: requestIdCounter++,
        },
        key,
        type: "nonce",
        chainId,
      });

      // Group Balance & Allowance Checks by unique tuple
      if (permit.token?.address && permit.amount && permit.owner) {
        const balanceKey = `${networkId}-${permit.permit2Address}-${permit.token.address}-${permit.owner}`;
        const ownerAddress = permit.owner as `0x${string}`;
        const tokenAddress = permit.token.address as `0x${string}`;
        if (!balancesAndAllowances.has(balanceKey)) {
          batchRequests.push({
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
              id: requestIdCounter++,
            },
            key: balanceKey,
            type: "balance",
            chainId: permit.networkId,
          });

          batchRequests.push({
            request: {
              jsonrpc: "2.0",
              method: "eth_call",
              params: [
                {
                  to: tokenAddress,
                  data: encodeFunctionData({ abi: erc20Abi, functionName: "allowance", args: [ownerAddress, permit.permit2Address] }),
                },
                "latest",
              ],
              id: requestIdCounter++,
            },
            key: balanceKey,
            type: "allowance",
            chainId: permit.networkId,
          });

          balancesAndAllowances.set(balanceKey, { networkId, permit2Address: permit.permit2Address, tokenAddress: permit.token.address, owner });
        }
      }
    });

    if (batchRequests.length === 0) continue; // Return original if nothing to check (e.g., only non-ERC20 passed)

    try {
      const batchPayload = batchRequests.map((br) => br.request);
      const batchResponses = (await rpcClient.request(networkId, batchPayload)) as JsonRpcResponse[];
      const responseMap = new Map<number, JsonRpcResponse>(batchResponses.map((res) => [res.id as number, res]));

      batchRequests.forEach((batchReq) => {
        const res = responseMap.get(batchReq.request.id as number);

        if (batchReq.type === "nonce") {
          // Handle nonce checks per permit (existing logic)
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
        } else if (batchReq.type === "balance" || batchReq.type === "allowance") {
          // Handle shared balance/allowance checks by balanceKey
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
              if (batchReq.type === "balance") {
                balanceAllowanceData.balance = resultValue;
              } else {
                balanceAllowanceData.allowance = resultValue;
              }
            } catch (parseError: unknown) {
              balanceAllowanceData.error = `Result parse error (${batchReq.type}). ${parseError instanceof Error ? parseError.message : String(parseError)}`;
            }
          } else {
            balanceAllowanceData.error = `Empty result (${batchReq.type})`;
          }
          if (balanceAllowanceData.balance !== undefined && balanceAllowanceData.allowance !== undefined && !balanceAllowanceData.error) {
            balanceAllowanceData.maxClaimable =
              balanceAllowanceData.balance < balanceAllowanceData.allowance ? balanceAllowanceData.balance : balanceAllowanceData.allowance;
          }
          balancesAndAllowances.set(balanceKey, balanceAllowanceData);
        }
      });

      // Apply balance/allowance results to all permits that share the same tuple
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

  // check duplicated permits by nonce
  for (const nonceGroup of permitsByNonce.values()) {
    const sortedByAmountDescending = nonceGroup.slice().sort((a, b) => {
      const diff = b.amount - a.amount;
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

  return { permits: finalPermits, balancesAndAllowances };
}

// --- Worker Message Handling ---

worker.onmessage = async (event) => {
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
      const mappedNewPermits = (
        await Promise.all(newPermitsFromDb.map((p: PermitRow, i: number) => mapDbPermitToPermitData(p, i, lowerCaseWalletAddress)))
      ).filter((p): p is PermitData => p !== null);
      // One-line summary for mapped permits
      console.log(`Worker: Mapped ${mappedNewPermits.length} new permits`);

      // 4. Validate *only* the mapped new permits
      if (mappedNewPermits.length > 0) {
        const validatedNewPermits = await validatePermitsBatch(mappedNewPermits);
        worker.postMessage({
          type: "NEW_PERMITS_VALIDATED",
          permits: validatedNewPermits.permits,
          balancesAndAllowances: validatedNewPermits.balancesAndAllowances,
        });
      } else {
        // If no new permits were found, still send back an empty array for consistency
        worker.postMessage({ type: "NEW_PERMITS_VALIDATED", permits: [], balancesAndAllowances: new Map() });
      }
    } catch (error: unknown) {
      console.error("Worker: Error fetching/validating new permits:", error);
      worker.postMessage({ type: "PERMITS_ERROR", error: error instanceof Error ? error.message : String(error) });
    }
  }
};
