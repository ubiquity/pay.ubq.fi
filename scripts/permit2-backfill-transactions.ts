#!/usr/bin/env -S deno run -A --ext=ts --env-file=.env

import { decodeFunctionData } from "viem";
import permit2Abi from "../src/fixtures/permit2-abi.ts";
import {
  createSupabaseClientFromEnv,
  fetchPermitsFromDb,
  getRpcBaseUrlFromEnv,
  isHexAddress,
  NEW_PERMIT2_ADDRESS,
  normalizeHexAddress,
  OLD_PERMIT2_ADDRESS,
  type PermitDbRowWithJoins,
} from "./permit2-tools.ts";

type CliArgs = {
  owner: string;
  since?: string;
  matchMode: "amount" | "beneficiary";
  scanNewPermit2Txlist: boolean;
  execute: boolean;
  maxUpdates: number;
  out?: string;
  pretty: boolean;
  help: boolean;
};

const TRANSFER_TOPIC0 = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

const permit2Addresses = new Set([OLD_PERMIT2_ADDRESS.toLowerCase(), NEW_PERMIT2_ADDRESS.toLowerCase()]);
const GNOSIS_CHAIN_ID = 100;
const GNOSIS_BLOCKSCOUT_API = "https://gnosis.blockscout.com/api";

const printUsage = () => {
  console.error(
    `
Usage:
  deno run -A --env-file=.env scripts/permit2-backfill-transactions.ts --owner 0x... [--since <timestamp>]
    [--match-mode amount|beneficiary] [--scan-new-permit2-txlist]
    [--out <file>] [--pretty] [--execute] [--max-updates <n>]

What it does:
  - Finds Permit2 claim txs (permitTransferFrom / batchPermitTransferFrom) and writes missing Supabase permits.transaction.
  - Works by scanning ERC20 Transfer logs for the funding wallet -> beneficiary transfers, then decoding matching Permit2 calldata
    to extract signatures and update rows.

Options:
  -o, --owner        Funding wallet (permit owner). Required.
  -s, --since        Only consider permits created after this timestamp (Date.parse-able).
      --match-mode   Candidate selection for ERC20 transfers: amount (default) or beneficiary (looser).
      --scan-new-permit2-txlist  Also scan Blockscout txlist for NEW Permit2 contract (default: false).
      --execute      Actually write to Supabase (default: false; dry-run report).
      --max-updates  Safety limit for number of permit rows to update (default: 500).
      --out          Write JSON report to a file (otherwise prints to stdout).
  -p, --pretty       Pretty-print JSON.
  -h, --help         Show help.

Env:
  SUPABASE_URL or VITE_SUPABASE_URL
  SUPABASE_ANON_KEY or VITE_SUPABASE_ANON_KEY (fallback: SUPABASE_SERVICE_ROLE_KEY)
  RPC_URL or VITE_RPC_URL (optional, defaults to https://rpc.ubq.fi)
    `.trim()
  );
};

const parseArgs = (argv: string[]): CliArgs => {
  const out: Omit<CliArgs, "owner"> = {
    execute: false,
    pretty: false,
    help: false,
    maxUpdates: 500,
    matchMode: "amount",
    scanNewPermit2Txlist: false,
  };
  let owner: string | undefined;

  const takeValue = (flag: string, value: string | undefined) => {
    if (!value || value.startsWith("-")) throw new Error(`Missing value for ${flag}`);
    return value;
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      out.help = true;
      continue;
    }
    if (arg === "--pretty" || arg === "-p") {
      out.pretty = true;
      continue;
    }
    if (arg === "--execute") {
      out.execute = true;
      continue;
    }
    if (arg === "--scan-new-permit2-txlist") {
      out.scanNewPermit2Txlist = true;
      continue;
    }
    if (arg === "--owner" || arg === "-o") {
      owner = takeValue(arg, argv[i + 1]);
      i += 1;
      continue;
    }
    if (arg.startsWith("--owner=")) {
      owner = arg.slice("--owner=".length);
      continue;
    }
    if (arg === "--since" || arg === "-s") {
      out.since = takeValue(arg, argv[i + 1]);
      i += 1;
      continue;
    }
    if (arg.startsWith("--since=")) {
      out.since = arg.slice("--since=".length);
      continue;
    }
    if (arg === "--out") {
      out.out = takeValue(arg, argv[i + 1]);
      i += 1;
      continue;
    }
    if (arg.startsWith("--out=")) {
      out.out = arg.slice("--out=".length);
      continue;
    }
    if (arg === "--max-updates") {
      const v = Number(takeValue(arg, argv[i + 1]));
      i += 1;
      if (!Number.isFinite(v) || v <= 0) throw new Error(`Invalid --max-updates: ${argv[i]}`);
      out.maxUpdates = Math.floor(v);
      continue;
    }
    if (arg.startsWith("--max-updates=")) {
      const v = Number(arg.slice("--max-updates=".length));
      if (!Number.isFinite(v) || v <= 0) throw new Error(`Invalid --max-updates: ${v}`);
      out.maxUpdates = Math.floor(v);
      continue;
    }
    if (arg === "--match-mode") {
      const v = takeValue(arg, argv[i + 1]);
      i += 1;
      if (v !== "amount" && v !== "beneficiary") throw new Error(`Invalid --match-mode: ${v}`);
      out.matchMode = v;
      continue;
    }
    if (arg.startsWith("--match-mode=")) {
      const v = arg.slice("--match-mode=".length);
      if (v !== "amount" && v !== "beneficiary") throw new Error(`Invalid --match-mode: ${v}`);
      out.matchMode = v;
      continue;
    }
    if (arg.startsWith("-")) throw new Error(`Unknown option: ${arg}`);
    throw new Error(`Unexpected positional arg: ${arg}`);
  }

  if (!owner) throw new Error("Missing --owner");
  return { owner, ...out };
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

type RpcLog = {
  address: string;
  topics: string[];
  data: string;
  blockNumber: string;
  transactionHash: string;
};

type RpcTx = {
  hash?: string;
  from?: string;
  to?: string | null;
  input?: string;
  blockHash?: string | null;
};

type RpcReceipt = {
  status?: string;
};

type BlockscoutTokenTransfer = {
  from?: string;
  to?: string;
  value?: string;
  hash?: string;
  contractAddress?: string;
};

type BlockscoutTxlistTx = {
  hash?: string;
  from?: string;
  to?: string;
  input?: string;
  isError?: string;
  txreceipt_status?: string;
  timeStamp?: string;
};

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const rpcCall = async <T>({ rpcBaseUrl, chainId, method, params }: { rpcBaseUrl: string; chainId: number; method: string; params: unknown[] }): Promise<T> => {
  const endpoint = `${rpcBaseUrl}/${chainId}`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  if (!response.ok) {
    let bodySnippet = "";
    try {
      const text = await response.text();
      if (text) bodySnippet = ` - ${text.slice(0, 300)}`;
    } catch {
      // ignore
    }
    throw new Error(`RPC call failed: HTTP ${response.status}${bodySnippet}`);
  }
  const json = (await response.json()) as JsonRpcResponse;
  if (json.error) throw new Error(json.error.message ?? "RPC error");
  return json.result as T;
};

const rpcBatchCallWithRetries = async ({
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
}): Promise<JsonRpcResponse[]> => {
  const endpoint = `${rpcBaseUrl}/${chainId}`;
  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
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
    } catch (error) {
      lastError = error;
      if (attempt === maxRetries) break;
      await sleep(retryDelayMs * 2 ** attempt);
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
};

const toBlockTag = (blockNumber: bigint) => `0x${blockNumber.toString(16)}`;

const encodeAddressTopic = (address: string) => `0x${address.toLowerCase().replace(/^0x/, "").padStart(64, "0")}`;

const decodeTopicAddress = (topic: string) => `0x${topic.slice(-40)}`.toLowerCase();

const parseUint256Hex = (value: string): bigint | null => {
  if (typeof value !== "string" || !value.startsWith("0x")) return null;
  try {
    return BigInt(value);
  } catch {
    return null;
  }
};

const isValidTxHash = (value: string | null | undefined) => Boolean(value && /^0x[0-9a-fA-F]{64}$/.test(value.trim()));

async function findFirstBlockAtOrAfterTimestamp({
  rpcBaseUrl,
  chainId,
  targetTimestampSeconds,
}: {
  rpcBaseUrl: string;
  chainId: number;
  targetTimestampSeconds: number;
}): Promise<bigint> {
  const latestHex = await rpcCall<string>({ rpcBaseUrl, chainId, method: "eth_blockNumber", params: [] });
  const latest = BigInt(latestHex);

  const getTimestamp = async (blockNumber: bigint): Promise<number> => {
    const block = await rpcCall<{ timestamp?: string }>({
      rpcBaseUrl,
      chainId,
      method: "eth_getBlockByNumber",
      params: [toBlockTag(blockNumber), false],
    });
    if (!block.timestamp || typeof block.timestamp !== "string") throw new Error(`Missing timestamp for block ${blockNumber.toString()}`);
    const ts = Number.parseInt(block.timestamp, 16);
    if (!Number.isFinite(ts)) throw new Error(`Invalid timestamp for block ${blockNumber.toString()}`);
    return ts;
  };

  const ts0 = await getTimestamp(0n);
  if (targetTimestampSeconds <= ts0) return 0n;

  let low = 0n;
  let high = latest;
  while (low < high) {
    const mid = (low + high) / 2n;
    const ts = await getTimestamp(mid);
    if (ts >= targetTimestampSeconds) {
      high = mid;
    } else {
      low = mid + 1n;
    }
  }
  return low;
}

function rowToBackfillablePermit(row: PermitDbRowWithJoins): {
  id: number;
  chainId: number;
  tokenAddress: `0x${string}`;
  owner: `0x${string}`;
  beneficiary: `0x${string}`;
  signature: `0x${string}`;
  amount: bigint;
  createdMs: number;
} | null {
  if (typeof row.transaction === "string" && isValidTxHash(row.transaction)) return null;

  const chainIdRaw = row.token?.network;
  const chainId = chainIdRaw !== null && chainIdRaw !== undefined ? Number(chainIdRaw) : NaN;
  if (!Number.isFinite(chainId) || chainId <= 0) return null;

  const tokenAddressRaw = row.token?.address;
  const ownerRaw = row.partner?.wallet?.address;
  const beneficiaryRaw = row.users?.wallets?.address;
  const signatureRaw = row.signature;

  if (!tokenAddressRaw || !ownerRaw || !beneficiaryRaw || !signatureRaw) return null;

  const tokenAddress = normalizeHexAddress(tokenAddressRaw);
  const owner = normalizeHexAddress(ownerRaw);
  const beneficiary = normalizeHexAddress(beneficiaryRaw);

  if (!isHexAddress(tokenAddress) || !isHexAddress(owner) || !isHexAddress(beneficiary)) return null;
  if (!/^0x[0-9a-fA-F]+$/.test(signatureRaw.trim())) return null;
  const signature = signatureRaw.trim().toLowerCase() as `0x${string}`;

  let amount: bigint;
  try {
    amount = BigInt(row.amount);
  } catch {
    return null;
  }

  const createdMs = Date.parse(String(row.created));
  if (!Number.isFinite(createdMs)) return null;

  return { id: row.id, chainId, tokenAddress, owner, beneficiary, signature, amount, createdMs };
}

const stringifyJson = (value: unknown, pretty: boolean) =>
  JSON.stringify(
    value,
    (_key, v) => {
      if (typeof v === "bigint") return v.toString();
      if (v instanceof Map) return Array.from(v.entries());
      if (v instanceof Set) return Array.from(v.values());
      return v;
    },
    pretty ? 2 : undefined
  );

async function fetchTransferLogs({
  rpcBaseUrl,
  chainId,
  tokenAddress,
  fromOwner,
  toAddressTopics,
  fromBlock,
  toBlock,
}: {
  rpcBaseUrl: string;
  chainId: number;
  tokenAddress: `0x${string}`;
  fromOwner: `0x${string}`;
  toAddressTopics: string[]; // already encoded 32-byte topics
  fromBlock: bigint;
  toBlock: bigint;
}): Promise<RpcLog[]> {
  const logs = await rpcCall<RpcLog[]>({
    rpcBaseUrl,
    chainId,
    method: "eth_getLogs",
    params: [
      {
        address: tokenAddress,
        fromBlock: toBlockTag(fromBlock),
        toBlock: toBlockTag(toBlock),
        topics: [TRANSFER_TOPIC0, encodeAddressTopic(fromOwner), toAddressTopics],
      },
    ],
  });

  return Array.isArray(logs) ? logs : [];
}

async function fetchBlockscoutTokenTransfers({
  address,
  tokenAddress,
}: {
  address: `0x${string}`;
  tokenAddress: `0x${string}`;
}): Promise<BlockscoutTokenTransfer[]> {
  const pageSize = 10_000;
  const out: BlockscoutTokenTransfer[] = [];

  for (let page = 1; page <= 50; page += 1) {
    const url = new URL(GNOSIS_BLOCKSCOUT_API);
    url.searchParams.set("module", "account");
    url.searchParams.set("action", "tokentx");
    url.searchParams.set("address", address);
    url.searchParams.set("contractaddress", tokenAddress);
    url.searchParams.set("page", String(page));
    url.searchParams.set("offset", String(pageSize));
    url.searchParams.set("sort", "asc");

    const response = await fetch(url.toString(), { method: "GET" });
    if (!response.ok) throw new Error(`Blockscout tokentx failed: HTTP ${response.status}`);
    const json = (await response.json()) as { status?: string; message?: string; result?: unknown };

    if (json.status !== "1") {
      const message = typeof json.message === "string" ? json.message : "Unknown Blockscout error";
      if (message.toLowerCase().includes("no transactions")) break;
      throw new Error(`Blockscout tokentx error: ${message}`);
    }

    const pageRows = Array.isArray(json.result) ? (json.result as BlockscoutTokenTransfer[]) : [];
    out.push(...pageRows);

    if (pageRows.length < pageSize) break;
  }

  return out;
}

async function fetchBlockscoutTxList({
  address,
  page,
  offset,
  sort,
}: {
  address: `0x${string}`;
  page: number;
  offset: number;
  sort: "asc" | "desc";
}): Promise<BlockscoutTxlistTx[]> {
  const url = new URL(GNOSIS_BLOCKSCOUT_API);
  url.searchParams.set("module", "account");
  url.searchParams.set("action", "txlist");
  url.searchParams.set("address", address);
  url.searchParams.set("page", String(page));
  url.searchParams.set("offset", String(offset));
  url.searchParams.set("sort", sort);

  const response = await fetch(url.toString(), { method: "GET" });
  if (!response.ok) throw new Error(`Blockscout txlist failed: HTTP ${response.status}`);
  const json = (await response.json()) as { status?: string; message?: string; result?: unknown };

  if (json.status !== "1") {
    const message = typeof json.message === "string" ? json.message : "Unknown Blockscout error";
    if (message.toLowerCase().includes("no transactions")) return [];
    throw new Error(`Blockscout txlist error: ${message}`);
  }

  return Array.isArray(json.result) ? (json.result as BlockscoutTxlistTx[]) : [];
}

async function discoverCandidateTxHashes({
  rpcBaseUrl,
  permits,
  sinceMs,
  matchMode,
}: {
  rpcBaseUrl: string;
  permits: ReturnType<typeof rowToBackfillablePermit>[];
  sinceMs: number;
  matchMode: "amount" | "beneficiary";
}): Promise<{
  candidateTxHashesByChain: Map<number, Set<string>>;
  scanSummary: {
    chainCount: number;
    tokenCount: number;
    beneficiaryCount: number;
    logCount: number;
    candidateTxCount: number;
  };
}> {
  const validPermits = permits.filter((p): p is NonNullable<typeof p> => Boolean(p));
  const owner = validPermits.at(0)?.owner;
  if (!owner) {
    return {
      candidateTxHashesByChain: new Map(),
      scanSummary: { chainCount: 0, tokenCount: 0, beneficiaryCount: 0, logCount: 0, candidateTxCount: 0 },
    };
  }

  const beneficiariesByChainToken = new Map<string, Set<string>>();
  const amountsByChainTokenBeneficiary = new Map<string, Set<string>>();
  const chainIds = new Set<number>();
  const tokenKeys = new Set<string>();

  for (const permit of validPermits) {
    chainIds.add(permit.chainId);
    const tokenKey = `${permit.chainId}:${permit.tokenAddress.toLowerCase()}`;
    tokenKeys.add(tokenKey);

    const beneficiaries = beneficiariesByChainToken.get(tokenKey) ?? new Set<string>();
    beneficiaries.add(permit.beneficiary.toLowerCase());
    beneficiariesByChainToken.set(tokenKey, beneficiaries);

    const amtKey = `${tokenKey}:${permit.beneficiary.toLowerCase()}`;
    const amountSet = amountsByChainTokenBeneficiary.get(amtKey) ?? new Set<string>();
    amountSet.add(permit.amount.toString());
    amountsByChainTokenBeneficiary.set(amtKey, amountSet);
  }

  const earliestSeconds = Math.floor(sinceMs / 1000);
  const startBlocksByChain = new Map<number, bigint>();
  for (const chainId of chainIds) {
    if (chainId === GNOSIS_CHAIN_ID) continue;
    const block = await findFirstBlockAtOrAfterTimestamp({ rpcBaseUrl, chainId, targetTimestampSeconds: earliestSeconds });
    startBlocksByChain.set(chainId, block);
  }

  const latestBlocksByChain = new Map<number, bigint>();
  for (const chainId of chainIds) {
    if (chainId === GNOSIS_CHAIN_ID) continue;
    const latestHex = await rpcCall<string>({ rpcBaseUrl, chainId, method: "eth_blockNumber", params: [] });
    latestBlocksByChain.set(chainId, BigInt(latestHex));
  }

  // Default chunk size for eth_getLogs ranges (varies by provider; keep conservative).
  const chunkSize = 9_000n;
  const toTopicChunkSize = 50;

  const candidateTxHashesByChain = new Map<number, Set<string>>();
  let logCount = 0;

  for (const tokenKey of tokenKeys) {
    const [chainIdStr, tokenAddressLower] = tokenKey.split(":");
    const chainId = Number(chainIdStr);
    const tokenAddress = normalizeHexAddress(tokenAddressLower) as `0x${string}`;
    const fromBlock = startBlocksByChain.get(chainId) ?? 0n;
    const latestBlock = latestBlocksByChain.get(chainId) ?? 0n;

    const beneficiaries = Array.from(beneficiariesByChainToken.get(tokenKey) ?? []);
    const beneficiaryTopics = beneficiaries.map((b) => encodeAddressTopic(b));

    // Gnosis: use Blockscout token transfer API (eth_getLogs range limits are too restrictive on default RPC).
    if (chainId === GNOSIS_CHAIN_ID) {
      let transfers: BlockscoutTokenTransfer[] = [];
      try {
        transfers = await fetchBlockscoutTokenTransfers({ address: owner, tokenAddress });
      } catch (error) {
        console.error(`Failed to fetch Blockscout transfers (token ${tokenAddress}): ${error instanceof Error ? error.message : String(error)}`);
        continue;
      }

      const beneficiarySetLower = new Set(beneficiaries);
      for (const t of transfers) {
        const from = typeof t.from === "string" ? t.from.toLowerCase() : null;
        const to = typeof t.to === "string" ? t.to.toLowerCase() : null;
        const value = typeof t.value === "string" ? t.value : null;
        const hash = typeof t.hash === "string" ? t.hash.toLowerCase() : null;
        if (!from || !to || !value || !hash) continue;
        if (from !== owner.toLowerCase()) continue;
        if (!beneficiarySetLower.has(to)) continue;

        if (matchMode === "amount") {
          const amtKey = `${chainId}:${tokenAddress.toLowerCase()}:${to}`;
          const wantAmounts = amountsByChainTokenBeneficiary.get(amtKey);
          if (!wantAmounts || !wantAmounts.has(value)) continue;
        }

        const existing = candidateTxHashesByChain.get(chainId) ?? new Set<string>();
        existing.add(hash);
        candidateTxHashesByChain.set(chainId, existing);
      }

      continue;
    }

    for (let bOffset = 0; bOffset < beneficiaryTopics.length; bOffset += toTopicChunkSize) {
      const toChunk = beneficiaryTopics.slice(bOffset, bOffset + toTopicChunkSize);

      for (let cursor = fromBlock; cursor <= latestBlock; cursor += chunkSize + 1n) {
        const toBlock = cursor + chunkSize < latestBlock ? cursor + chunkSize : latestBlock;

        let logs: RpcLog[] = [];
        try {
          logs = await fetchTransferLogs({ rpcBaseUrl, chainId, tokenAddress, fromOwner: owner, toAddressTopics: toChunk, fromBlock: cursor, toBlock });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          console.error(`Failed to fetch logs (chain ${chainId}, token ${tokenAddress}) at blocks ${cursor.toString()}..${toBlock.toString()}: ${message}`);
          continue;
        }

        for (const log of logs) {
          logCount += 1;
          const txHash = typeof log.transactionHash === "string" ? log.transactionHash.toLowerCase() : null;
          if (!txHash || !txHash.startsWith("0x")) continue;

          const toTopic = log.topics?.[2];
          if (!toTopic || typeof toTopic !== "string") continue;
          const toAddr = decodeTopicAddress(toTopic);
          if (matchMode === "amount") {
            const amt = parseUint256Hex(log.data);
            if (amt === null) continue;

            const amtKey = `${chainId}:${tokenAddress.toLowerCase()}:${toAddr}`;
            const wantAmounts = amountsByChainTokenBeneficiary.get(amtKey);
            if (!wantAmounts || !wantAmounts.has(amt.toString())) continue;
          }

          const existing = candidateTxHashesByChain.get(chainId) ?? new Set<string>();
          existing.add(txHash);
          candidateTxHashesByChain.set(chainId, existing);
        }

        if (toBlock === latestBlock) break;
      }
    }
  }

  const beneficiaryCount = Array.from(beneficiariesByChainToken.values()).reduce((sum, set) => sum + set.size, 0);
  const candidateTxCount = Array.from(candidateTxHashesByChain.values()).reduce((sum, set) => sum + set.size, 0);

  return {
    candidateTxHashesByChain,
    scanSummary: {
      chainCount: chainIds.size,
      tokenCount: tokenKeys.size,
      beneficiaryCount,
      logCount,
      candidateTxCount,
    },
  };
}

async function decodePermit2SignaturesFromBlockscoutTxlist({
  permit2Address,
  ownerFilter,
  sinceSeconds,
}: {
  permit2Address: `0x${string}`;
  ownerFilter: `0x${string}`;
  sinceSeconds: number | null;
}): Promise<{
  signatureToTx: Map<string, string>;
  scannedTxCount: number;
  decodedTxCount: number;
  skippedTxCount: number;
  duplicates: { signature: string; txA: string; txB: string }[];
}> {
  const signatureToTx = new Map<string, string>();
  const duplicates: { signature: string; txA: string; txB: string }[] = [];
  let scannedTxCount = 0;
  let decodedTxCount = 0;
  let skippedTxCount = 0;

  const pageSize = 10_000;
  const maxPages = 50;
  const permit2Lower = permit2Address.toLowerCase();

  for (let page = 1; page <= maxPages; page += 1) {
    const txs = await fetchBlockscoutTxList({ address: permit2Address, page, offset: pageSize, sort: "desc" });
    if (txs.length === 0) break;

    let shouldStop = false;

    for (const tx of txs) {
      scannedTxCount += 1;

      const hashRaw = typeof tx.hash === "string" ? tx.hash.trim().toLowerCase() : null;
      const hash = hashRaw ? (hashRaw.startsWith("0x") ? hashRaw : `0x${hashRaw}`) : null;
      if (!hash || !isValidTxHash(hash)) {
        skippedTxCount += 1;
        continue;
      }

      const to = typeof tx.to === "string" ? tx.to.toLowerCase() : null;
      if (!to || to !== permit2Lower) {
        skippedTxCount += 1;
        continue;
      }

      const timestampSeconds = (() => {
        if (typeof tx.timeStamp !== "string") return null;
        const n = Number.parseInt(tx.timeStamp, 10);
        return Number.isFinite(n) ? n : null;
      })();

      if (sinceSeconds !== null && timestampSeconds !== null && timestampSeconds < sinceSeconds) {
        shouldStop = true;
        break;
      }

      // Blockscout status flags: treat any non-zero isError or non-1 receipt status as failed.
      if (tx.isError && tx.isError !== "0") {
        skippedTxCount += 1;
        continue;
      }
      if (tx.txreceipt_status && tx.txreceipt_status !== "1") {
        skippedTxCount += 1;
        continue;
      }

      const input = typeof tx.input === "string" ? tx.input : null;
      if (!input || !input.startsWith("0x") || input === "0x") {
        skippedTxCount += 1;
        continue;
      }

      let decoded: { functionName: string; args: readonly unknown[] };
      try {
        decoded = decodeFunctionData({ abi: permit2Abi, data: input as `0x${string}` }) as unknown as { functionName: string; args: readonly unknown[] };
      } catch {
        skippedTxCount += 1;
        continue;
      }

      const extracted: string[] = [];

      if (decoded.functionName === "permitTransferFrom") {
        const ownerArg = decoded.args.at(-2);
        if (typeof ownerArg !== "string" || ownerArg.toLowerCase() !== ownerFilter.toLowerCase()) {
          skippedTxCount += 1;
          continue;
        }
        const sig = decoded.args.at(-1);
        if (typeof sig === "string") extracted.push(sig);
      } else if (decoded.functionName === "permitWitnessTransferFrom") {
        const ownerArg = decoded.args.at(-3);
        if (typeof ownerArg !== "string" || ownerArg.toLowerCase() !== ownerFilter.toLowerCase()) {
          skippedTxCount += 1;
          continue;
        }
        const sig = decoded.args.at(-1);
        if (typeof sig === "string") extracted.push(sig);
      } else if (decoded.functionName === "batchPermitTransferFrom") {
        const ownersArg = decoded.args.at(-2);
        if (!Array.isArray(ownersArg) || !ownersArg.some((o) => typeof o === "string" && o.toLowerCase() === ownerFilter.toLowerCase())) {
          skippedTxCount += 1;
          continue;
        }
        const sigs = decoded.args.at(-1);
        if (Array.isArray(sigs) && sigs.every((s) => typeof s === "string")) extracted.push(...(sigs as string[]));
      } else {
        skippedTxCount += 1;
        continue;
      }

      if (extracted.length === 0) {
        skippedTxCount += 1;
        continue;
      }

      decodedTxCount += 1;
      for (const sig of extracted) {
        const normalized = sig.toLowerCase();
        const existing = signatureToTx.get(normalized);
        if (existing && existing !== hash) {
          duplicates.push({ signature: normalized, txA: existing, txB: hash });
          continue;
        }
        signatureToTx.set(normalized, hash);
      }
    }

    if (shouldStop) break;
    if (txs.length < pageSize) break;
  }

  return { signatureToTx, scannedTxCount, decodedTxCount, skippedTxCount, duplicates };
}

async function decodePermit2SignaturesFromTxs({
  rpcBaseUrl,
  chainId,
  txHashes,
  ownerFilter,
}: {
  rpcBaseUrl: string;
  chainId: number;
  txHashes: string[];
  ownerFilter: `0x${string}`;
}): Promise<{
  signatureToTx: Map<string, string>;
  decodedTxCount: number;
  skippedTxCount: number;
  duplicates: { signature: string; txA: string; txB: string }[];
}> {
  const signatureToTx = new Map<string, string>();
  const duplicates: { signature: string; txA: string; txB: string }[] = [];
  let decodedTxCount = 0;
  let skippedTxCount = 0;

  const batchSize = 100;
  for (let offset = 0; offset < txHashes.length; offset += batchSize) {
    const chunk = txHashes.slice(offset, offset + batchSize);
    const requests: JsonRpcRequest[] = [];
    const idToKind = new Map<number, { kind: "tx" | "receipt"; hash: string }>();

    let id = 1;
    for (const hash of chunk) {
      requests.push({ jsonrpc: "2.0", method: "eth_getTransactionByHash", params: [hash], id });
      idToKind.set(id, { kind: "tx", hash });
      id += 1;
      requests.push({ jsonrpc: "2.0", method: "eth_getTransactionReceipt", params: [hash], id });
      idToKind.set(id, { kind: "receipt", hash });
      id += 1;
    }

    const responses = await rpcBatchCallWithRetries({ rpcBaseUrl, chainId, requests });
    const txByHash = new Map<string, RpcTx>();
    const receiptByHash = new Map<string, RpcReceipt>();

    for (const res of responses) {
      const meta = idToKind.get(res.id);
      if (!meta) continue;
      if (res.error) continue;

      if (meta.kind === "tx") {
        txByHash.set(meta.hash, (res.result ?? null) as RpcTx);
      } else {
        receiptByHash.set(meta.hash, (res.result ?? null) as RpcReceipt);
      }
    }

    for (const hash of chunk) {
      const tx = txByHash.get(hash);
      const receipt = receiptByHash.get(hash);
      if (!tx || !receipt) {
        skippedTxCount += 1;
        continue;
      }

      if (receipt.status?.toLowerCase() !== "0x1") {
        skippedTxCount += 1;
        continue;
      }

      const to = typeof tx.to === "string" ? tx.to.toLowerCase() : null;
      if (!to || !permit2Addresses.has(to)) {
        skippedTxCount += 1;
        continue;
      }

      const input = typeof tx.input === "string" ? tx.input : null;
      if (!input || !input.startsWith("0x") || input === "0x") {
        skippedTxCount += 1;
        continue;
      }

      let decoded: { functionName: string; args: readonly unknown[] };
      try {
        decoded = decodeFunctionData({ abi: permit2Abi, data: input as `0x${string}` }) as unknown as { functionName: string; args: readonly unknown[] };
      } catch {
        skippedTxCount += 1;
        continue;
      }

      if (decoded.functionName !== "permitTransferFrom" && decoded.functionName !== "batchPermitTransferFrom") {
        skippedTxCount += 1;
        continue;
      }

      // Filter to only txs that actually claim from the funding wallet we’re backfilling.
      if (decoded.functionName === "permitTransferFrom") {
        const args = decoded.args as unknown[];
        const ownerArg = args.at(-2);
        if (typeof ownerArg !== "string" || ownerArg.toLowerCase() !== ownerFilter.toLowerCase()) {
          skippedTxCount += 1;
          continue;
        }
      } else {
        const args = decoded.args as unknown[];
        const ownersArg = args.at(-2);
        if (!Array.isArray(ownersArg) || !ownersArg.some((o) => typeof o === "string" && o.toLowerCase() === ownerFilter.toLowerCase())) {
          skippedTxCount += 1;
          continue;
        }
      }

      const extracted: string[] = [];
      if (decoded.functionName === "permitTransferFrom") {
        const sig = decoded.args.at(-1);
        if (typeof sig === "string") extracted.push(sig);
      } else {
        const sigs = decoded.args.at(-1);
        if (Array.isArray(sigs) && sigs.every((s) => typeof s === "string")) extracted.push(...(sigs as string[]));
      }

      if (extracted.length === 0) {
        skippedTxCount += 1;
        continue;
      }

      decodedTxCount += 1;
      for (const sig of extracted) {
        const normalized = sig.toLowerCase();
        const existing = signatureToTx.get(normalized);
        if (existing && existing !== hash) {
          duplicates.push({ signature: normalized, txA: existing, txB: hash });
          continue;
        }
        signatureToTx.set(normalized, hash);
      }
    }
  }

  return { signatureToTx, decodedTxCount, skippedTxCount, duplicates };
}

async function updateTransactionsInDb({
  supabase,
  signatureToTx,
  maxUpdates,
}: {
  supabase: ReturnType<typeof createSupabaseClientFromEnv>["client"];
  signatureToTx: Map<string, string>;
  maxUpdates: number;
}): Promise<{
  updated: number;
  conflicts: { signature: string; existing: string; tx: string }[];
  missing: string[];
}> {
  const byTx = new Map<string, string[]>();
  for (const [sig, tx] of signatureToTx.entries()) {
    const list = byTx.get(tx) ?? [];
    list.push(sig);
    byTx.set(tx, list);
  }

  const conflicts: { signature: string; existing: string; tx: string }[] = [];
  const missing: string[] = [];
  let updated = 0;

  for (const [tx, sigs] of byTx.entries()) {
    if (updated >= maxUpdates) break;

    const { data: existingRows, error: selectError } = await supabase.from("permits").select("id, signature, transaction").in("signature", sigs);
    if (selectError) throw new Error(selectError.message);

    const existingBySig = new Map<string, { id: number; transaction: string | null }>();
    for (const row of existingRows ?? []) {
      if (!row.signature || typeof row.id !== "number") continue;
      const rawTx = row.transaction ? String(row.transaction).trim() : "";
      existingBySig.set(String(row.signature).toLowerCase(), { id: row.id, transaction: rawTx ? rawTx.toLowerCase() : null });
    }

    for (const sig of sigs) {
      if (!existingBySig.has(sig)) missing.push(sig);
    }

    const toUpdate = sigs
      .map((sig) => ({ sig, existing: existingBySig.get(sig) ?? null }))
      .filter(({ existing }) => Boolean(existing))
      .filter(({ existing, sig }) => {
        if (!existing) return false;
        const existingTx = existing.transaction;
        if (!existingTx || !isValidTxHash(existingTx)) return true;
        if (existingTx.toLowerCase() !== tx.toLowerCase()) conflicts.push({ signature: sig, existing: existingTx, tx });
        return false;
      });

    if (toUpdate.length === 0) continue;

    const remaining = maxUpdates - updated;
    const capped = toUpdate.slice(0, remaining);
    const ids = capped.map((u) => u.existing!.id);

    const { data: updatedRows, error: updateError } = await supabase
      .from("permits")
      .update({ transaction: tx.toLowerCase() })
      .in("id", ids)
      .select("id, signature");
    if (updateError) throw new Error(updateError.message);

    updated += updatedRows?.length ?? 0;
  }

  return { updated, conflicts, missing };
}

const main = async () => {
  let args: CliArgs;
  try {
    args = parseArgs(Deno.args);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    console.error("");
    printUsage();
    Deno.exit(1);
    return;
  }

  if (args.help) {
    printUsage();
    return;
  }

  if (!isHexAddress(args.owner)) {
    console.error("Invalid --owner (expected 0x + 40 hex chars).");
    console.error("");
    printUsage();
    Deno.exit(1);
    return;
  }

  const owner = normalizeHexAddress(args.owner);
  const sinceMs = (() => {
    if (args.since && !Number.isNaN(Date.parse(args.since))) return Date.parse(args.since);
    return NaN;
  })();

  const { client: supabase, usesServiceRole } = createSupabaseClientFromEnv({ preferServiceRole: args.execute });
  if (args.execute && !usesServiceRole) {
    throw new Error("Refusing to --execute without SUPABASE_SERVICE_ROLE_KEY (service role required to bypass RLS for updates).");
  }
  if (usesServiceRole) {
    console.error("Note: using SUPABASE_SERVICE_ROLE_KEY (bypasses RLS); results may differ from browser worker behavior.");
  }

  const rpcBaseUrl = getRpcBaseUrlFromEnv();
  const rows = await fetchPermitsFromDb({ supabase, owner, since: args.since });

  const candidates = rows.map(rowToBackfillablePermit).filter((p): p is NonNullable<typeof p> => Boolean(p));
  const earliestCreatedMs = candidates.reduce((min, p) => (p.createdMs < min ? p.createdMs : min), Number.POSITIVE_INFINITY);
  const effectiveSinceMs = Number.isFinite(sinceMs) ? sinceMs : earliestCreatedMs;

  const { candidateTxHashesByChain, scanSummary } = await discoverCandidateTxHashes({
    rpcBaseUrl,
    permits: candidates,
    sinceMs: effectiveSinceMs,
    matchMode: args.matchMode,
  });

  const allSignatureToTx = new Map<string, string>();
  const allDuplicates: { signature: string; txA: string; txB: string }[] = [];
  let decodedTxCount = 0;
  let skippedTxCount = 0;
  let candidateTxCount = 0;
  let txlistScan: { scannedTxCount: number; decodedTxCount: number; skippedTxCount: number; extractedSignatureCount: number } | null = null;
  let txlistScanError: string | null = null;

  for (const [chainId, txHashSet] of candidateTxHashesByChain.entries()) {
    const txHashesSorted = Array.from(txHashSet.values()).sort();
    candidateTxCount += txHashesSorted.length;
    const {
      signatureToTx,
      decodedTxCount: decoded,
      skippedTxCount: skipped,
      duplicates,
    } = await decodePermit2SignaturesFromTxs({
      rpcBaseUrl,
      chainId,
      txHashes: txHashesSorted,
      ownerFilter: owner,
    });
    decodedTxCount += decoded;
    skippedTxCount += skipped;
    allDuplicates.push(...duplicates);
    for (const [sig, tx] of signatureToTx.entries()) {
      if (allSignatureToTx.has(sig)) continue;
      allSignatureToTx.set(sig, tx);
    }
  }

  if (args.scanNewPermit2Txlist) {
    if (candidates.some((c) => c.chainId === GNOSIS_CHAIN_ID)) {
      try {
        const sinceSeconds = Number.isFinite(effectiveSinceMs) ? Math.floor(effectiveSinceMs / 1000) : null;
        const {
          signatureToTx: txlistSignatureToTx,
          scannedTxCount,
          decodedTxCount: txlistDecoded,
          skippedTxCount: txlistSkipped,
          duplicates,
        } = await decodePermit2SignaturesFromBlockscoutTxlist({
          permit2Address: NEW_PERMIT2_ADDRESS,
          ownerFilter: owner,
          sinceSeconds,
        });

        txlistScan = { scannedTxCount, decodedTxCount: txlistDecoded, skippedTxCount: txlistSkipped, extractedSignatureCount: txlistSignatureToTx.size };
        allDuplicates.push(...duplicates);

        for (const [sig, tx] of txlistSignatureToTx.entries()) {
          const existing = allSignatureToTx.get(sig);
          if (existing && existing !== tx) {
            allDuplicates.push({ signature: sig, txA: existing, txB: tx });
            continue;
          }
          if (!existing) allSignatureToTx.set(sig, tx);
        }
      } catch (error) {
        txlistScanError = error instanceof Error ? error.message : String(error);
        txlistScan = null;
      }
    } else {
      txlistScan = { scannedTxCount: 0, decodedTxCount: 0, skippedTxCount: 0, extractedSignatureCount: 0 };
    }
  }

  const signaturesInDb = new Set(candidates.map((p) => p.signature.toLowerCase()));
  const matched = new Map<string, string>();
  for (const [sig, tx] of allSignatureToTx.entries()) {
    if (!signaturesInDb.has(sig)) continue;
    matched.set(sig, tx);
  }

  let updateResult: Awaited<ReturnType<typeof updateTransactionsInDb>> | null = null;
  let updateError: string | null = null;
  if (args.execute) {
    try {
      updateResult = await updateTransactionsInDb({ supabase, signatureToTx: matched, maxUpdates: args.maxUpdates });
    } catch (error) {
      updateError = error instanceof Error ? error.message : String(error);
      updateResult = null;
    }
  }

  const report = {
    generatedAt: new Date().toISOString(),
    owner,
    since: args.since ?? null,
    matchMode: args.matchMode,
    scanNewPermit2Txlist: args.scanNewPermit2Txlist,
    effectiveSince: new Date(effectiveSinceMs).toISOString(),
    rpcBaseUrl,
    permit2: { old: OLD_PERMIT2_ADDRESS, new: NEW_PERMIT2_ADDRESS },
    fetchedRowCount: rows.length,
    candidatePermitCount: candidates.length,
    scanSummary,
    candidateTxCount,
    decodedTxCount,
    skippedTxCount,
    txlistScan,
    txlistScanError,
    extractedSignatureCount: allSignatureToTx.size,
    matchedSignatureCount: matched.size,
    duplicates: allDuplicates,
    executed: args.execute,
    ...(args.execute
      ? { updated: updateResult?.updated ?? 0, conflicts: updateResult?.conflicts ?? [], missing: updateResult?.missing ?? [], updateError }
      : {}),
  };

  const json = stringifyJson(report, args.pretty);
  if (args.out) {
    await Deno.writeTextFile(args.out, json);
    console.error(`Wrote report: ${args.out}`);
    return;
  }

  console.log(json);
};

await main();
