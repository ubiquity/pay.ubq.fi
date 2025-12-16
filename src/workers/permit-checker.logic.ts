import type { SupabaseClient } from "@supabase/supabase-js";
import type { JsonRpcResponse, createRpcClient } from "@ubiquity-dao/permit2-rpc-client";
import { type Address, encodeFunctionData, erc20Abi, hashTypedData, parseAbiItem, recoverAddress } from "viem";
import { NEW_PERMIT2_ADDRESS, OLD_PERMIT2_ADDRESS } from "../constants/config.ts";
import type { Database, Tables } from "../database.types.ts";
import type { AllowanceAndBalance, PermitData } from "../types.ts";

export interface Logger {
  log: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
}

const defaultLogger: Logger = console;

// Define table names
const PERMITS_TABLE = "permits";
const WALLETS_TABLE = "wallets";
const TOKENS_TABLE = "tokens";
const PARTNERS_TABLE = "partners";
const LOCATIONS_TABLE = "locations";

// ABIs needed for checks
const permit2Abi = parseAbiItem("function nonceBitmap(address owner, uint256 wordPos) view returns (uint256)");

const PERMIT2_DOMAIN_NAME = "Permit2";
const TOKEN_PERMISSIONS = [
  { name: "token", type: "address" },
  { name: "amount", type: "uint256" },
] as const;

const PERMIT_TRANSFER_FROM_TYPES = {
  PermitTransferFrom: [
    { name: "permitted", type: "TokenPermissions" },
    { name: "spender", type: "address" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
  TokenPermissions: TOKEN_PERMISSIONS,
} as const;

// Define type for JSON-RPC Request object
interface JsonRpcRequest {
  jsonrpc: "2.0";
  method: string;
  params: unknown[];
  id: number | string;
}

// Type alias for permits row using generated types
export type PermitRow = Tables<"permits"> & {
  token: Tables<"tokens"> | null;
  partner: (Tables<"partners"> & { wallet: Tables<"wallets"> | null }) | null;
  location: Tables<"locations"> | null;
};

export type PermitMappingIssue =
  | "missing_partner_id"
  | "missing_partner"
  | "missing_partner_wallet"
  | "missing_partner_wallet_address"
  | "missing_token_id"
  | "missing_token"
  | "missing_token_address"
  | "invalid_token_network"
  | "missing_deadline"
  | "invalid_deadline"
  | "missing_signature"
  | "invalid_signature_prefix"
  | "invalid_signature_format"
  | "invalid_amount"
  | "signature_recovery_failed";

export type MapDbPermitToPermitDataResult = {
  permitData: PermitData | null;
  issues: PermitMappingIssue[];
};

const isHexString = (value: string) => /^0x[0-9a-fA-F]*$/.test(value);

export async function mapDbPermitToPermitDataWithIssues({
  permit,
  lowerCaseWalletAddress,
}: {
  permit: PermitRow;
  lowerCaseWalletAddress: string;
}): Promise<MapDbPermitToPermitDataResult> {
  const issues: PermitMappingIssue[] = [];

  if (permit.partner_id === null) issues.push("missing_partner_id");
  if (!permit.partner) issues.push("missing_partner");
  if (permit.partner && !permit.partner.wallet) issues.push("missing_partner_wallet");

  const ownerWalletData = permit.partner?.wallet;
  const ownerAddressStr = ownerWalletData?.address ? String(ownerWalletData.address) : "";
  if (!ownerAddressStr) issues.push("missing_partner_wallet_address");

  if (permit.token_id === null) issues.push("missing_token_id");
  if (!permit.token) issues.push("missing_token");

  const tokenData = permit.token;
  const tokenAddressStr = tokenData?.address ? String(tokenData.address) : undefined;
  if (!tokenAddressStr) issues.push("missing_token_address");

  const networkIdNum = Number(tokenData?.network ?? 0);
  if (!Number.isFinite(networkIdNum) || networkIdNum <= 0) issues.push("invalid_token_network");

  if (!permit.deadline) {
    issues.push("missing_deadline");
  } else if (typeof permit.deadline !== "string" || isNaN(parseInt(permit.deadline, 10))) {
    issues.push("invalid_deadline");
  }

  if (!permit.signature) {
    issues.push("missing_signature");
  } else if (!permit.signature.startsWith("0x")) {
    issues.push("invalid_signature_prefix");
  } else if (!isHexString(permit.signature) || (permit.signature.length !== 130 && permit.signature.length !== 132)) {
    // The code checks for total string lengths including the "0x" prefix:
    // - 65 bytes (130 hex chars) + "0x" = 132 total characters
    // - 64 bytes (128 hex chars, EIP-2098) + "0x" = 130 total characters
    issues.push("invalid_signature_format");
  }

  try {
    BigInt(permit.amount);
  } catch {
    issues.push("invalid_amount");
  }

  if (issues.length > 0) {
    return { permitData: null, issues };
  }

  const githubUrlStr = permit.location?.node_url ? String(permit.location.node_url) : "";

  let permit2Address: string;
  try {
    permit2Address = await getPermit2Address({
      nonce: permit.nonce,
      tokenAddress: tokenAddressStr ?? "",
      amount: permit.amount,
      deadline: String(permit.deadline),
      beneficiary: lowerCaseWalletAddress,
      owner: ownerAddressStr,
      signature: String(permit.signature),
      networkId: networkIdNum,
    });
  } catch {
    return { permitData: null, issues: ["signature_recovery_failed"] };
  }

  const permitData: PermitData = {
    permit2Address: permit2Address as `0x${string}`,
    nonce: String(permit.nonce),
    networkId: networkIdNum,
    beneficiary: lowerCaseWalletAddress,
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
    ...(permit.created && { created_at: permit.created }),
  };

  const deadlineInt = parseInt(permitData.deadline, 10);
  if (isNaN(deadlineInt) || deadlineInt < Math.floor(Date.now() / 1000)) {
    permitData.status = "Expired";
  }

  return { permitData, issues: [] };
}

// Function to map DB result to PermitData (ERC20 only focus)
export async function mapDbPermitToPermitData({
  permit,
  index,
  lowerCaseWalletAddress,
  logger = defaultLogger,
}: {
  permit: PermitRow;
  index: number;
  lowerCaseWalletAddress: string;
  logger?: Logger;
}): Promise<PermitData | null> {
  const { permitData, issues } = await mapDbPermitToPermitDataWithIssues({ permit, lowerCaseWalletAddress });

  if (permitData) return permitData;

  if (issues.includes("missing_partner_wallet_address")) {
    logger.warn(`PermitChecker: Permit [${index}] with nonce ${permit.nonce} has no owner address`);
  } else if (issues.includes("missing_token_address")) {
    logger.warn(`PermitChecker: Permit [${index}] with nonce ${permit.nonce} has no token address`);
  } else if (issues.includes("invalid_token_network")) {
    logger.warn(`PermitChecker: Permit [${index}] with nonce ${permit.nonce} has invalid network ID: ${permit.token?.network}`);
  } else if (issues.includes("missing_deadline") || issues.includes("invalid_deadline")) {
    logger.warn(`PermitChecker: Permit [${index}] with nonce ${permit.nonce} has invalid deadline: ${permit.deadline}`);
  } else if (issues.includes("missing_signature") || issues.includes("invalid_signature_prefix") || issues.includes("invalid_signature_format")) {
    logger.warn(`PermitChecker: Permit [${index}] with nonce ${permit.nonce} has invalid signature format: ${permit.signature}`);
  } else if (issues.includes("invalid_amount")) {
    logger.warn(`PermitChecker: Permit [${index}] with nonce ${permit.nonce} has invalid amount format: ${permit.amount}`);
  } else if (issues.includes("signature_recovery_failed")) {
    logger.warn(`PermitChecker: Permit [${index}] with nonce ${permit.nonce} signature recovery failed`);
  } else {
    logger.warn(`PermitChecker: Permit [${index}] with nonce ${permit.nonce} skipped: ${issues.join(", ")}`);
  }

  return null;
}

export async function fetchPermitsFromDb({
  supabaseClient,
  walletAddress,
  lastCheckTimestamp,
  logger = defaultLogger,
}: {
  supabaseClient: SupabaseClient<Database>;
  walletAddress: string;
  lastCheckTimestamp: string | null;
  logger?: Logger;
}): Promise<PermitRow[]> {
  const normalizedWalletAddress = walletAddress.toLowerCase();

  const permitsData: PermitRow[] = [];

  const directJoinQuery = `
              *,
              token:${TOKENS_TABLE}(address, network),
              partner:${PARTNERS_TABLE}(wallet:${WALLETS_TABLE}(address)),
              location:${LOCATIONS_TABLE}(node_url),
              users!inner(
                  wallets!inner(address)
              )
    `;

  const buildQuery = () => {
    let query = supabaseClient
      .from(PERMITS_TABLE)
      .select(directJoinQuery)
      .is("transaction", null)
      .filter("users.wallets.address", "ilike", normalizedWalletAddress);

    if (lastCheckTimestamp && !isNaN(Date.parse(lastCheckTimestamp))) {
      query = query.gt("created", lastCheckTimestamp);
    }

    return query;
  };

  const pageSize = 1000;
  for (let offset = 0; ; offset += pageSize) {
    const result = await buildQuery()
      .order("id", { ascending: true })
      .range(offset, offset + pageSize - 1);

    if (result.error) {
      logger.error(`PermitChecker: query error: ${result.error.message}`, result.error);
      return [];
    }

    const page = (result.data ?? []) as PermitRow[];
    if (page.length === 0) break;

    permitsData.push(...page);
    if (page.length < pageSize) break;
  }

  logger.log(`PermitChecker: Found ${permitsData.length} permits`);

  return permitsData;
}

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
  const permit = {
    permitted: {
      token: permitData.tokenAddress as Address,
      amount: BigInt(permitData.amount),
    },
    nonce: BigInt(permitData.nonce),
    deadline: BigInt(permitData.deadline),
    spender: permitData.beneficiary as Address,
  } as const;

  const hash = hashTypedData({
    domain: { name: PERMIT2_DOMAIN_NAME, chainId: permitData.networkId, verifyingContract: NEW_PERMIT2_ADDRESS },
    types: PERMIT_TRANSFER_FROM_TYPES,
    primaryType: "PermitTransferFrom",
    message: permit,
  });
  const signer = await recoverAddress({ hash, signature: permitData.signature as `0x${string}` });
  if (signer.toLowerCase() === permitData.owner.toLowerCase()) {
    return NEW_PERMIT2_ADDRESS;
  }
  return OLD_PERMIT2_ADDRESS;
}

export async function validatePermitsBatch({
  rpcClient,
  permitsToValidate,
  logger = defaultLogger,
}: {
  rpcClient: ReturnType<typeof createRpcClient>;
  permitsToValidate: PermitData[];
  logger?: Logger;
}): Promise<{ permits: PermitData[]; balancesAndAllowances: Map<string, AllowanceAndBalance> }> {
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
      if (permit.type !== "erc20-permit") {
        return;
      }

      const key = permit.signature;
      const chainId = permit.networkId;
      const owner = permit.owner as Address;

      const wordPos = BigInt(permit.nonce) >> 8n;
      batchRequests.push({
        request: {
          jsonrpc: "2.0",
          method: "eth_call",
          params: [
            { to: permit.permit2Address, data: encodeFunctionData({ abi: [permit2Abi], functionName: "nonceBitmap", args: [owner, wordPos] }) },
            "latest",
          ],
          id: requestIdCounter++,
        },
        key,
        type: "nonce",
        chainId,
      });

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

    if (batchRequests.length === 0) continue;

    try {
      const batchPayload = batchRequests.map((br) => br.request);
      const batchResponses = (await rpcClient.request(networkId, batchPayload)) as JsonRpcResponse[];
      const responseMap = new Map<number, JsonRpcResponse>(batchResponses.map((res) => [res.id as number, res]));

      batchRequests.forEach((batchReq) => {
        const res = responseMap.get(batchReq.request.id as number);

        if (batchReq.type === "nonce") {
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
      logger.error("PermitChecker: Error during validation batch RPC request:", error);
      permitsToValidate.forEach((permit) => {
        const updateData = checkedPermitsMap.get(permit.signature) || {
          checkError: `Batch request failed: ${error instanceof Error ? error.message : String(error)}`,
        };
        if (!updateData.checkError) {
          updateData.checkError = `Batch request failed: ${error instanceof Error ? error.message : String(error)}`;
        }
        checkedPermitsMap.set(permit.signature, updateData);
      });
    }
  }

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

  for (const nonceGroup of permitsByNonce.values()) {
    const sortedByAmountDescending = nonceGroup.slice().sort((a, b) => {
      const diff = b.amount - a.amount;
      return diff > 0n ? 1 : diff < 0n ? -1 : 0;
    });
    const passing = sortedByAmountDescending.find((p) => !p.checkError);
    if (passing) {
      nonceGroup.forEach((p) => {
        if (!p.checkError && p.signature !== passing.signature) {
          p.checkError = "permit with same nonce but higher amount exists";
        }
      });
    }
  }

  finalPermits.forEach((p) => {
    if (!p.checkError && p.status === undefined) {
      p.status = "Valid";
    }
  });

  return { permits: finalPermits, balancesAndAllowances };
}
