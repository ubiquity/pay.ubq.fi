import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { encodeFunctionData, hashTypedData, parseAbiItem, recoverAddress } from "viem";
import type { Database } from "../src/database.types.ts";

export const OLD_PERMIT2_ADDRESS = "0x000000000022D473030F116dDEE9F6B43aC78BA3";
export const NEW_PERMIT2_ADDRESS = "0xd635918A75356D133d5840eE5c9ED070302C9C60";
export const PERMIT2_DOMAIN_NAME = "Permit2";

export const PERMIT_TRANSFER_FROM_TYPES = {
  PermitTransferFrom: [
    { name: "permitted", type: "TokenPermissions" },
    { name: "spender", type: "address" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
  TokenPermissions: [
    { name: "token", type: "address" },
    { name: "amount", type: "uint256" },
  ],
} as const;

export type PermitDbRow = Database["public"]["Tables"]["permits"]["Row"];

export type PermitDbRowWithJoins = PermitDbRow & {
  token?: { address?: string | null; network?: number | string | null } | null;
  partner?: { wallet?: { address?: string | null } | null } | null;
  location?: { node_url?: string | null } | null;
  users?: { wallets?: { address?: string | null } | null } | null;
};

export type Permit2Kind = "old" | "new" | "unknown";

export type Permit2Inference = {
  kind: Permit2Kind;
  expectedPermit2Address: `0x${string}` | null;
  error?: string;
};

export type NonceBitmapRef = {
  chainId: number;
  permit2Address: `0x${string}`;
  owner: `0x${string}`;
  wordPos: bigint;
};

export type NonceBitmapResult = { bitmap: bigint } | { error: string };
export type NonceBitmapProgress = {
  chainId: number;
  chunkIndex: number;
  totalChunks: number;
  chunkSize: number;
};

type JsonRpcRequest = {
  jsonrpc: "2.0";
  method: string;
  params: unknown[];
  id: number;
};

type JsonRpcResponse = {
  jsonrpc?: "2.0";
  id: number;
  result?: unknown;
  error?: { code?: number; message?: string };
};

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const runWithConcurrency = async <T>(
  items: T[],
  concurrency: number,
  task: (item: T, index: number) => Promise<void>
) => {
  if (items.length === 0) return;
  const limit = Math.max(1, Math.floor(concurrency));
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const index = cursor;
      if (index >= items.length) break;
      cursor += 1;
      await task(items[index], index);
    }
  });
  await Promise.all(workers);
};

export const getEnv = (key: string) => {
  try {
    return Deno.env.get(key) ?? undefined;
  } catch {
    return undefined;
  }
};

export const isHexAddress = (value: string) => /^0x[0-9a-fA-F]{40}$/.test(value.trim());

export const normalizeHexAddress = (value: string) => {
  const trimmed = value.trim();
  return `0x${trimmed.replace(/^0x/, "").toLowerCase()}` as `0x${string}`;
};

export function createSupabaseClientFromEnv(options?: { preferServiceRole?: boolean }): {
  client: SupabaseClient<Database>;
  usesServiceRole: boolean;
  url: string;
} {
  const url = getEnv("SUPABASE_URL") ?? getEnv("VITE_SUPABASE_URL");
  const anonKey = getEnv("SUPABASE_ANON_KEY") ?? getEnv("VITE_SUPABASE_ANON_KEY");
  const serviceRoleKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");
  const preferServiceRole = Boolean(options?.preferServiceRole);
  const key = preferServiceRole && serviceRoleKey ? serviceRoleKey : (anonKey ?? serviceRoleKey);

  if (!url || !key) {
    throw new Error(
      "Missing Supabase env vars. Need SUPABASE_URL (or VITE_SUPABASE_URL) and SUPABASE_ANON_KEY/VITE_SUPABASE_ANON_KEY (or SUPABASE_SERVICE_ROLE_KEY)."
    );
  }

  return { client: createClient<Database>(url, key), usesServiceRole: Boolean(key === serviceRoleKey), url };
}

export function getRpcBaseUrlFromEnv(): string {
  return (getEnv("RPC_URL") ?? getEnv("VITE_RPC_URL") ?? "https://rpc.ubq.fi").replace(/\/$/, "");
}

export async function fetchPermitsFromDb({
  supabase,
  owner,
  since,
}: {
  supabase: SupabaseClient<Database>;
  owner?: string;
  since?: string;
}): Promise<PermitDbRowWithJoins[]> {
  const joinQuery = `
    id,
    amount,
    nonce,
    deadline,
    signature,
    transaction,
    invalidation,
    created,
    beneficiary_id,
    location_id,
    token_id,
    token:tokens(address, network),
    partner:partners!inner(wallet:wallets!inner(address)),
    location:locations(node_url),
    users!inner(wallets!inner(address))
  `;

  const pageSize = 1000;
  const rows: PermitDbRowWithJoins[] = [];
  const ownerFilter = owner ? normalizeHexAddress(owner) : null;

  const buildQuery = () => {
    let query = supabase.from("permits").select(joinQuery);
    if (ownerFilter) query = query.filter("partner.wallet.address", "ilike", ownerFilter);
    if (since && !isNaN(Date.parse(since))) query = query.gt("created", since);
    return query;
  };

  for (let offset = 0; ; offset += pageSize) {
    const result = await buildQuery()
      .order("id", { ascending: true })
      .range(offset, offset + pageSize - 1);

    if (result.error) throw new Error(result.error.message);

    const page = (result.data ?? []) as PermitDbRowWithJoins[];
    if (page.length === 0) break;
    rows.push(...page);
    if (page.length < pageSize) break;
  }

  return rows;
}

export function noncePositions(nonce: bigint): { wordPos: bigint; bitPos: bigint } {
  return { wordPos: nonce >> 8n, bitPos: nonce & 255n };
}

export async function inferPermit2({
  chainId,
  tokenAddress,
  amount,
  nonce,
  deadline,
  beneficiary,
  owner,
  signature,
}: {
  chainId: number;
  tokenAddress: `0x${string}`;
  amount: bigint;
  nonce: bigint;
  deadline: bigint;
  beneficiary: `0x${string}`;
  owner: `0x${string}`;
  signature: `0x${string}`;
}): Promise<Permit2Inference> {
  const message = {
    permitted: { token: tokenAddress, amount },
    nonce,
    deadline,
    spender: beneficiary,
  } as const;

  try {
    const hash = hashTypedData({
      domain: { name: PERMIT2_DOMAIN_NAME, chainId, verifyingContract: NEW_PERMIT2_ADDRESS },
      types: PERMIT_TRANSFER_FROM_TYPES,
      primaryType: "PermitTransferFrom",
      message,
    });
    const signer = (await recoverAddress({ hash, signature })).toLowerCase();
    const ownerLower = owner.toLowerCase();
    if (signer === ownerLower) {
      return { kind: "new", expectedPermit2Address: NEW_PERMIT2_ADDRESS };
    }
    return { kind: "old", expectedPermit2Address: OLD_PERMIT2_ADDRESS };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { kind: "unknown", expectedPermit2Address: null, error: message };
  }
}

const permit2NonceBitmapAbiItem = parseAbiItem("function nonceBitmap(address owner, uint256 wordPos) view returns (uint256)");

export function encodeNonceBitmapCall({ owner, wordPos }: { owner: `0x${string}`; wordPos: bigint }): `0x${string}` {
  return encodeFunctionData({
    abi: [permit2NonceBitmapAbiItem],
    functionName: "nonceBitmap",
    args: [owner, wordPos],
  });
}

async function rpcBatchCall({
  rpcBaseUrl,
  chainId,
  requests,
}: {
  rpcBaseUrl: string;
  chainId: number;
  requests: JsonRpcRequest[];
}): Promise<JsonRpcResponse[]> {
  const endpoint = `${rpcBaseUrl}/${chainId}`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(requests),
  });

  if (!response.ok) {
    let bodySnippet = "";
    try {
      const text = await response.text();
      if (text) bodySnippet = ` - ${text.slice(0, 300)}`;
    } catch {
      // ignore
    }
    throw new Error(`RPC batch failed: HTTP ${response.status}${bodySnippet}`);
  }

  const json = (await response.json()) as JsonRpcResponse[] | JsonRpcResponse;
  return Array.isArray(json) ? json : [json];
}

async function rpcBatchCallWithRetries({
  rpcBaseUrl,
  chainId,
  requests,
  maxRetries = 2,
  retryDelayMs = 250,
}: {
  rpcBaseUrl: string;
  chainId: number;
  requests: JsonRpcRequest[];
  maxRetries?: number;
  retryDelayMs?: number;
}): Promise<JsonRpcResponse[]> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      return await rpcBatchCall({ rpcBaseUrl, chainId, requests });
    } catch (error) {
      lastError = error;
      if (attempt === maxRetries) break;
      await sleep(retryDelayMs * 2 ** attempt);
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

export async function fetchNonceBitmaps({
  rpcBaseUrl,
  refs,
  batchSize = 500,
  maxRetries = 2,
  concurrency = 64,
  onProgress,
}: {
  rpcBaseUrl: string;
  refs: NonceBitmapRef[];
  batchSize?: number;
  maxRetries?: number;
  concurrency?: number;
  onProgress?: (progress: NonceBitmapProgress) => void;
}): Promise<Map<string, NonceBitmapResult>> {
  const out = new Map<string, NonceBitmapResult>();
  const byChain = new Map<number, NonceBitmapRef[]>();

  for (const ref of refs) {
    const list = byChain.get(ref.chainId) ?? [];
    list.push(ref);
    byChain.set(ref.chainId, list);
  }

  const fetchChunk = async (chainId: number, chunkRefs: NonceBitmapRef[]): Promise<void> => {
    if (chunkRefs.length === 0) return;

    const idToKey = new Map<number, string>();
    const requests: JsonRpcRequest[] = chunkRefs.map((ref, idx) => {
      const id = idx + 1;
      idToKey.set(id, bitmapKey(ref));
      return {
        jsonrpc: "2.0",
        method: "eth_call",
        params: [{ to: ref.permit2Address, data: encodeNonceBitmapCall({ owner: ref.owner, wordPos: ref.wordPos }) }, "latest"],
        id,
      };
    });

    let responses: JsonRpcResponse[];
    try {
      responses = await rpcBatchCallWithRetries({ rpcBaseUrl, chainId, requests, maxRetries });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (chunkRefs.length <= 1) {
        for (const ref of chunkRefs) out.set(bitmapKey(ref), { error: message });
        return;
      }

      const mid = Math.ceil(chunkRefs.length / 2);
      await fetchChunk(chainId, chunkRefs.slice(0, mid));
      await fetchChunk(chainId, chunkRefs.slice(mid));
      return;
    }

    const responseMap = new Map<number, JsonRpcResponse>();
    for (const res of responses) responseMap.set(res.id, res);

    for (const [id, key] of idToKey.entries()) {
      const res = responseMap.get(id);
      if (!res) {
        out.set(key, { error: "Missing RPC response" });
        continue;
      }
      if (res.error) {
        out.set(key, { error: res.error.message ?? "RPC error" });
        continue;
      }
      if (typeof res.result !== "string") {
        out.set(key, { error: "Invalid RPC result" });
        continue;
      }
      try {
        out.set(key, { bitmap: BigInt(res.result) });
      } catch (error) {
        out.set(key, { error: error instanceof Error ? error.message : "Bitmap parse error" });
      }
    }
  };

  const tasks: Array<{ chainId: number; chunkRefs: NonceBitmapRef[]; index: number }> = [];
  let totalChunks = 0;
  for (const [chainId, chainRefs] of byChain.entries()) {
    for (let offset = 0; offset < chainRefs.length; offset += batchSize) {
      const chunk = chainRefs.slice(offset, offset + batchSize);
      totalChunks += 1;
      tasks.push({ chainId, chunkRefs: chunk, index: totalChunks });
    }
  }

  await runWithConcurrency(tasks, concurrency, async (task) => {
    await fetchChunk(task.chainId, task.chunkRefs);
    onProgress?.({
      chainId: task.chainId,
      chunkIndex: task.index,
      totalChunks,
      chunkSize: task.chunkRefs.length,
    });
  });

  return out;
}

export function bitmapKey(ref: NonceBitmapRef): string {
  return `${ref.chainId}:${ref.permit2Address.toLowerCase()}:${ref.owner.toLowerCase()}:${ref.wordPos.toString()}`;
}

export function isNonceUsed({ bitmap, bitPos }: { bitmap: bigint; bitPos: bigint }): boolean {
  return Boolean(bitmap & (1n << bitPos));
}
