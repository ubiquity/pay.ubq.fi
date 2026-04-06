#!/usr/bin/env -S deno run -A --ext=ts --env-file=.env

import { keccak256, stringToHex } from "viem";
import {
  createSupabaseClientFromEnv,
  getRpcBaseUrlFromEnv,
  isHexAddress,
  NEW_PERMIT2_ADDRESS,
  noncePositions,
  normalizeHexAddress,
  OLD_PERMIT2_ADDRESS,
} from "./permit2-tools.ts";

type CliArgs = {
  report: string;
  out: string;
  owner?: string;
  since?: string;
  until?: string;
  fromBlock?: string;
  timeoutMs: number;
  chunkSize: number;
  useBlockscout: boolean;
  verbose: boolean;
  execute: boolean;
  maxUpdates: number;
  concurrency: number;
  pretty: boolean;
  help: boolean;
};

const DEFAULT_REPORT = "reports/permit2-audit-local.json";
const DEFAULT_OUT = "reports/permit2-invalidation-scan.json";

const INVALIDATION_TOPIC0 = keccak256(stringToHex("UnorderedNonceInvalidation(address,uint256,uint256)"));
const GNOSIS_BLOCKSCOUT_API = "https://gnosis.blockscout.com/api";

const printUsage = () => {
  console.error(
    `
Usage:
  deno run -A --env-file=.env scripts/permit2-scan-invalidations.ts [--report <file>] [--out <file>]
    [--owner 0x...] [--since <timestamp>] [--until <timestamp>] [--pretty] [--execute] [--max-updates <n>]
    [--from-block <n>] [--chunk-size <n>] [--timeout-ms <n>] [--use-blockscout] [--verbose] [--concurrency <n>]

What it does:
  - Reads a permit2 audit report (default: ${DEFAULT_REPORT}).
  - Scans Permit2 UnorderedNonceInvalidation logs for the owners in the report.
  - Matches invalidation masks to permit nonces and outputs a JSON report.
  - Optionally writes invalidation tx hashes into Supabase permits.invalidation.

Options:
  -r, --report  Audit report JSON path (default: ${DEFAULT_REPORT}).
  -o, --out     Output report path (default: ${DEFAULT_OUT}).
  -a, --owner   Only scan permits for this owner.
  -s, --since   Only scan logs from this timestamp (Date.parse-able).
      --until   Only scan logs up to this timestamp (Date.parse-able).
      --from-block  Start scanning from this block number (decimal or hex).
      --execute Actually write invalidation tx hashes to Supabase (default: false).
      --max-updates  Safety limit for number of permit rows to update (default: 500).
      --chunk-size   Block range size for eth_getLogs (default: 10000).
      --timeout-ms   RPC timeout in milliseconds (default: 20000; 0 disables).
      --use-blockscout  Use Blockscout logs API for chain 100 (default: false).
      --verbose     Emit progress logs to stderr.
      --concurrency  Number of concurrent log fetches per group (default: 64).
  -p, --pretty  Pretty-print JSON.
  -h, --help    Show help.

Env:
  RPC_URL or VITE_RPC_URL (optional, defaults to https://rpc.ubq.fi)
    `.trim()
  );
};

const parseArgs = (argv: string[]): CliArgs => {
  const out: CliArgs = {
    report: DEFAULT_REPORT,
    out: DEFAULT_OUT,
    pretty: false,
    help: false,
    execute: false,
    maxUpdates: 500,
    timeoutMs: 20_000,
    chunkSize: 10_000,
    useBlockscout: false,
    verbose: false,
    concurrency: 64,
  };
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
    if (arg === "--report" || arg === "-r") {
      out.report = takeValue(arg, argv[i + 1]);
      i += 1;
      continue;
    }
    if (arg.startsWith("--report=")) {
      out.report = arg.slice("--report=".length);
      continue;
    }
    if (arg === "--out" || arg === "-o") {
      out.out = takeValue(arg, argv[i + 1]);
      i += 1;
      continue;
    }
    if (arg.startsWith("--out=")) {
      out.out = arg.slice("--out=".length);
      continue;
    }
    if (arg === "--owner" || arg === "-a") {
      out.owner = takeValue(arg, argv[i + 1]);
      i += 1;
      continue;
    }
    if (arg.startsWith("--owner=")) {
      out.owner = arg.slice("--owner=".length);
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
    if (arg === "--from-block") {
      out.fromBlock = takeValue(arg, argv[i + 1]);
      i += 1;
      continue;
    }
    if (arg.startsWith("--from-block=")) {
      out.fromBlock = arg.slice("--from-block=".length);
      continue;
    }
    if (arg === "--until") {
      out.until = takeValue(arg, argv[i + 1]);
      i += 1;
      continue;
    }
    if (arg.startsWith("--until=")) {
      out.until = arg.slice("--until=".length);
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
    if (arg === "--timeout-ms") {
      const v = Number(takeValue(arg, argv[i + 1]));
      i += 1;
      if (!Number.isFinite(v) || v < 0) throw new Error(`Invalid --timeout-ms: ${argv[i]}`);
      out.timeoutMs = Math.floor(v);
      continue;
    }
    if (arg.startsWith("--timeout-ms=")) {
      const v = Number(arg.slice("--timeout-ms=".length));
      if (!Number.isFinite(v) || v < 0) throw new Error(`Invalid --timeout-ms: ${v}`);
      out.timeoutMs = Math.floor(v);
      continue;
    }
    if (arg === "--chunk-size") {
      const v = Number(takeValue(arg, argv[i + 1]));
      i += 1;
      if (!Number.isFinite(v) || v <= 0) throw new Error(`Invalid --chunk-size: ${argv[i]}`);
      out.chunkSize = Math.floor(v);
      continue;
    }
    if (arg.startsWith("--chunk-size=")) {
      const v = Number(arg.slice("--chunk-size=".length));
      if (!Number.isFinite(v) || v <= 0) throw new Error(`Invalid --chunk-size: ${v}`);
      out.chunkSize = Math.floor(v);
      continue;
    }
    if (arg === "--concurrency") {
      const v = Number(takeValue(arg, argv[i + 1]));
      i += 1;
      if (!Number.isFinite(v) || v <= 0) throw new Error(`Invalid --concurrency: ${argv[i]}`);
      out.concurrency = Math.floor(v);
      continue;
    }
    if (arg.startsWith("--concurrency=")) {
      const v = Number(arg.slice("--concurrency=".length));
      if (!Number.isFinite(v) || v <= 0) throw new Error(`Invalid --concurrency: ${v}`);
      out.concurrency = Math.floor(v);
      continue;
    }
    if (arg === "--use-blockscout") {
      out.useBlockscout = true;
      continue;
    }
    if (arg === "--verbose") {
      out.verbose = true;
      continue;
    }
    if (arg.startsWith("-")) throw new Error(`Unknown option: ${arg}`);
    throw new Error(`Unexpected positional arg: ${arg}`);
  }

  return out;
};

type RpcLog = {
  address?: string;
  topics?: string[];
  data?: string;
  blockNumber?: string;
  transactionHash?: string;
};

type JsonRpcResponse = {
  result?: unknown;
  error?: { message?: string };
};

type BlockscoutResponse = {
  status?: string;
  message?: string;
  result?: unknown;
};

type InvalidationLog = {
  chainId: number;
  permit2Address: `0x${string}`;
  owner: `0x${string}`;
  txHash: `0x${string}`;
  blockNumber: bigint;
  wordPos: bigint;
  mask: bigint;
};

type PermitTarget = {
  id: number;
  chainId: number;
  owner: `0x${string}`;
  nonce: bigint;
  wordPos: bigint;
  bitPos: bigint;
  created: string;
  createdMs: number;
  permit2Addresses: `0x${string}`[];
  expectedPermit2: string | null;
  expectedPermit2Address: `0x${string}` | null;
  tokenSymbol: string | null;
  amountRaw: string | null;
  amountFormatted: string | null;
  githubUrl: string | null;
  beneficiary: `0x${string}` | null;
  token: `0x${string}` | null;
  signature: `0x${string}` | null;
};

type SelectedInvalidation = {
  permitId: number;
  chainId: number;
  owner: `0x${string}`;
  txHash: `0x${string}`;
  blockNumber: string;
  permit2Address: `0x${string}`;
};

const stringifyJson = (value: unknown, pretty: boolean) =>
  JSON.stringify(
    value,
    (_key, v) => {
      if (typeof v === "bigint") return v.toString();
      if (v instanceof Map) return Array.from(v.entries());
      return v;
    },
    pretty ? 2 : undefined
  );

const toBlockTag = (blockNumber: bigint) => `0x${blockNumber.toString(16)}`;

const encodeAddressTopic = (address: string) => `0x${address.toLowerCase().replace(/^0x/, "").padStart(64, "0")}`;

const parseHexBigInt = (value: string | undefined | null): bigint | null => {
  if (!value || typeof value !== "string") return null;
  try {
    if (value.startsWith("0x")) return BigInt(value);
    if (/^[0-9]+$/.test(value)) return BigInt(value);
    return null;
  } catch {
    return null;
  }
};

const parseDateMs = (value: string | undefined): number | null => {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const parseBlockValue = (value: string | undefined): bigint | null => {
  if (!value) return null;
  const trimmed = value.trim();
  if (/^0x[0-9a-fA-F]+$/.test(trimmed)) {
    try {
      return BigInt(trimmed);
    } catch {
      return null;
    }
  }
  if (/^[0-9]+$/.test(trimmed)) {
    try {
      return BigInt(trimmed);
    } catch {
      return null;
    }
  }
  return null;
};

const normalizeTxHash = (value: string | null | undefined): `0x${string}` | null => {
  if (!value) return null;
  const trimmed = value.trim().toLowerCase();
  if (!/^0x[0-9a-f]{64}$/.test(trimmed)) return null;
  return trimmed as `0x${string}`;
};

let rpcTimeoutMs = 20_000;

const nowIso = () => new Date().toISOString();

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

const rpcCall = async <T>({
  rpcBaseUrl,
  chainId,
  method,
  params,
}: {
  rpcBaseUrl: string;
  chainId: number;
  method: string;
  params: unknown[];
}): Promise<T> => {
  const endpoint = `${rpcBaseUrl}/${chainId}`;
  const controller = rpcTimeoutMs > 0 ? new AbortController() : null;
  const timeout = controller ? setTimeout(() => controller.abort(), rpcTimeoutMs) : null;
  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      ...(controller ? { signal: controller.signal } : {}),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error(`RPC timeout after ${rpcTimeoutMs}ms`);
    }
    throw error;
  } finally {
    if (timeout) clearTimeout(timeout);
  }
  if (!response.ok) throw new Error(`RPC failed: HTTP ${response.status}`);
  const json = (await response.json()) as JsonRpcResponse;
  if (json.error) throw new Error(json.error.message ?? "RPC error");
  return json.result as T;
};

async function fetchBlockscoutInvalidationLogs({
  permit2Address,
  owner,
  fromBlock,
  toBlock,
}: {
  permit2Address: `0x${string}`;
  owner: `0x${string}`;
  fromBlock: bigint;
  toBlock: bigint;
}): Promise<RpcLog[]> {
  const out: RpcLog[] = [];
  const pageSize = 1000;
  for (let page = 1; ; page += 1) {
    const url = new URL(GNOSIS_BLOCKSCOUT_API);
    url.searchParams.set("module", "logs");
    url.searchParams.set("action", "getLogs");
    url.searchParams.set("fromBlock", fromBlock.toString());
    url.searchParams.set("toBlock", toBlock.toString());
    url.searchParams.set("address", permit2Address);
    url.searchParams.set("topic0", INVALIDATION_TOPIC0);
    url.searchParams.set("topic1", encodeAddressTopic(owner));
    url.searchParams.set("topic0_1_opr", "and");
    url.searchParams.set("page", String(page));
    url.searchParams.set("offset", String(pageSize));

    const response = await fetch(url);
    if (!response.ok) throw new Error(`Blockscout logs failed: HTTP ${response.status}`);
    const json = (await response.json()) as BlockscoutResponse;
    const status = typeof json.status === "string" ? json.status : null;
    const message = typeof json.message === "string" ? json.message : "Unknown Blockscout error";

    if (status === "0") {
      if (message.toLowerCase().includes("no logs")) {
        break;
      }
      throw new Error(`Blockscout logs error: ${message}`);
    }

    const rows = Array.isArray(json.result) ? (json.result as RpcLog[]) : [];
    out.push(...rows);
    if (rows.length < pageSize) break;
  }

  return out;
}

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

  const getTimestamp = async (blockNumber: bigint): Promise<number | null> => {
    const block = await rpcCall<{ timestamp?: string } | null>({
      rpcBaseUrl,
      chainId,
      method: "eth_getBlockByNumber",
      params: [toBlockTag(blockNumber), false],
    });
    if (!block || typeof block !== "object") return null;
    if (!block.timestamp || typeof block.timestamp !== "string") return null;
    const ts = Number.parseInt(block.timestamp, 16);
    if (!Number.isFinite(ts)) return null;
    return ts;
  };

  const ts0 = await getTimestamp(0n);
  if (ts0 !== null && targetTimestampSeconds <= ts0) return 0n;

  let low = 0n;
  let high = latest;
  while (low < high) {
    const mid = (low + high) / 2n;
    const ts = await getTimestamp(mid);
    if (ts === null) {
      low = mid + 1n;
      continue;
    }
    if (ts >= targetTimestampSeconds) {
      high = mid;
    } else {
      low = mid + 1n;
    }
  }
  return low;
}

async function fetchInvalidationLogs({
  rpcBaseUrl,
  chainId,
  permit2Address,
  owner,
  fromBlock,
  toBlock,
  useBlockscout,
  errors,
}: {
  rpcBaseUrl: string;
  chainId: number;
  permit2Address: `0x${string}`;
  owner: `0x${string}`;
  fromBlock: bigint;
  toBlock: bigint;
  useBlockscout: boolean;
  errors: Array<{ chainId: number; permit2Address: `0x${string}`; owner: `0x${string}`; fromBlock: string; toBlock: string; error: string }>;
}): Promise<RpcLog[]> {
  if (useBlockscout && chainId === 100) {
    try {
      return await fetchBlockscoutInvalidationLogs({ permit2Address, owner, fromBlock, toBlock });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push({
        chainId,
        permit2Address,
        owner,
        fromBlock: fromBlock.toString(),
        toBlock: toBlock.toString(),
        error: message,
      });
      return [];
    }
  }

  const fetchRange = async (start: bigint, end: bigint): Promise<RpcLog[]> => {
    try {
      const logs = await rpcCall<RpcLog[]>({
        rpcBaseUrl,
        chainId,
        method: "eth_getLogs",
        params: [
          {
            address: permit2Address,
            topics: [INVALIDATION_TOPIC0, encodeAddressTopic(owner)],
            fromBlock: toBlockTag(start),
            toBlock: toBlockTag(end),
          },
        ],
      });
      return Array.isArray(logs) ? logs : [];
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (start >= end) {
        errors.push({
          chainId,
          permit2Address,
          owner,
          fromBlock: start.toString(),
          toBlock: end.toString(),
          error: message,
        });
        return [];
      }
      const mid = (start + end) / 2n;
      const left = await fetchRange(start, mid);
      const right = await fetchRange(mid + 1n, end);
      return [...left, ...right];
    }
  };

  return fetchRange(fromBlock, toBlock);
}

const parseInvalidationLog = ({
  chainId,
  permit2Address,
  owner,
  log,
}: {
  chainId: number;
  permit2Address: `0x${string}`;
  owner: `0x${string}`;
  log: RpcLog;
}): InvalidationLog | null => {
  const txHash = typeof log.transactionHash === "string" ? log.transactionHash.toLowerCase() : null;
  if (!txHash || !/^0x[0-9a-f]{64}$/.test(txHash)) return null;

  const blockNumber = parseHexBigInt(log.blockNumber ?? null);
  if (blockNumber === null) return null;

  const data = typeof log.data === "string" ? log.data : null;
  if (!data || !data.startsWith("0x") || data.length < 2 + 64 * 2) return null;

  const wordHex = `0x${data.slice(2, 66)}`;
  const maskHex = `0x${data.slice(66, 130)}`;

  let wordPos: bigint;
  let mask: bigint;
  try {
    wordPos = BigInt(wordHex);
    mask = BigInt(maskHex);
  } catch {
    return null;
  }

  return {
    chainId,
    permit2Address,
    owner,
    txHash: txHash as `0x${string}`,
    blockNumber,
    wordPos,
    mask,
  };
};

const pickPermit2Addresses = ({
  expectedPermit2,
  expectedPermit2Address,
}: {
  expectedPermit2: string | null;
  expectedPermit2Address: string | null;
}): `0x${string}`[] => {
  const candidates: `0x${string}`[] = [OLD_PERMIT2_ADDRESS, NEW_PERMIT2_ADDRESS];
  if (expectedPermit2 === "old") return [OLD_PERMIT2_ADDRESS];
  if (expectedPermit2 === "new") return [NEW_PERMIT2_ADDRESS];
  if (expectedPermit2Address && isHexAddress(expectedPermit2Address)) {
    return [normalizeHexAddress(expectedPermit2Address)];
  }
  return candidates;
};

const pickInvalidation = ({
  permit,
  candidates,
}: {
  permit: PermitTarget;
  candidates: Array<{ txHash: `0x${string}`; blockNumber: string; permit2Address: `0x${string}` }>;
}): { txHash: `0x${string}`; blockNumber: string; permit2Address: `0x${string}` } | null => {
  if (candidates.length === 0) return null;
  const expected = permit.expectedPermit2Address?.toLowerCase() ?? null;
  const sorted = [...candidates].sort((a, b) => {
    const aMatch = expected && a.permit2Address.toLowerCase() === expected ? 0 : 1;
    const bMatch = expected && b.permit2Address.toLowerCase() === expected ? 0 : 1;
    if (aMatch !== bMatch) return aMatch - bMatch;
    const aBlock = BigInt(a.blockNumber);
    const bBlock = BigInt(b.blockNumber);
    if (aBlock !== bBlock) return aBlock < bBlock ? -1 : 1;
    if (a.txHash !== b.txHash) return a.txHash < b.txHash ? -1 : 1;
    return 0;
  });
  return sorted[0] ?? null;
};

async function updateInvalidationsInDb({
  supabase,
  selected,
  maxUpdates,
}: {
  supabase: ReturnType<typeof createSupabaseClientFromEnv>["client"];
  selected: SelectedInvalidation[];
  maxUpdates: number;
}): Promise<{
  updated: number;
  conflicts: Array<{ permitId: number; existing: string; tx: string }>;
  missing: number[];
}> {
  const ids = selected.map((entry) => entry.permitId);
  if (ids.length === 0) return { updated: 0, conflicts: [], missing: [] };

  const { data: existingRows, error: selectError } = await supabase.from("permits").select("id, invalidation").in("id", ids);
  if (selectError) throw new Error(selectError.message);

  const existingById = new Map<number, { invalidation: string | null }>();
  for (const row of existingRows ?? []) {
    const id = Number((row as { id: number }).id);
    const invalidationRaw = (row as { invalidation?: string | null }).invalidation ?? null;
    existingById.set(id, { invalidation: invalidationRaw ? invalidationRaw : null });
  }

  const conflicts: Array<{ permitId: number; existing: string; tx: string }> = [];
  const missing: number[] = [];
  const updatesByTx = new Map<string, number[]>();

  for (const entry of selected) {
    const existing = existingById.get(entry.permitId);
    if (!existing) {
      missing.push(entry.permitId);
      continue;
    }

    const existingTx = normalizeTxHash(existing.invalidation);
    const desiredTx = normalizeTxHash(entry.txHash);
    if (!desiredTx) continue;

    if (existingTx) {
      if (existingTx !== desiredTx) {
        conflicts.push({ permitId: entry.permitId, existing: existingTx, tx: desiredTx });
      }
      continue;
    }

    const list = updatesByTx.get(desiredTx) ?? [];
    list.push(entry.permitId);
    updatesByTx.set(desiredTx, list);
  }

  let updated = 0;
  for (const [tx, permitIds] of updatesByTx.entries()) {
    if (updated >= maxUpdates) break;
    const remaining = maxUpdates - updated;
    const chunk = permitIds.slice(0, remaining);
    if (chunk.length === 0) continue;
    const { data: updatedRows, error: updateError } = await supabase
      .from("permits")
      .update({ invalidation: tx })
      .in("id", chunk)
      .is("invalidation", null)
      .select("id");
    if (updateError) throw new Error(updateError.message);
    updated += updatedRows?.length ?? 0;
  }

  return { updated, conflicts, missing };
}

const loadReportPermits = (raw: string) => {
  const parsed = JSON.parse(raw) as {
    anomalies?: { onChainUsedButDbTransactionNull?: { permits?: unknown[] } };
  };
  const permits = parsed.anomalies?.onChainUsedButDbTransactionNull?.permits;
  if (!Array.isArray(permits)) {
    throw new Error("Report missing anomalies.onChainUsedButDbTransactionNull.permits array.");
  }
  return permits as Array<Record<string, unknown>>;
};

const main = async () => {
  const args = parseArgs(Deno.args);
  if (args.help) {
    printUsage();
    return;
  }

  rpcTimeoutMs = args.timeoutMs;
  const log = (...parts: unknown[]) => {
    if (!args.verbose) return;
    console.error(`[${nowIso()}]`, ...parts);
  };
  const concurrency = Math.max(1, Math.floor(args.concurrency));

  const ownerFilter = args.owner ? normalizeHexAddress(args.owner) : null;
  if (ownerFilter && !isHexAddress(ownerFilter)) {
    throw new Error(`Invalid --owner address: ${args.owner}`);
  }

  const sinceMs = parseDateMs(args.since);
  if (args.since && sinceMs === null) {
    throw new Error(`Invalid --since value: ${args.since}`);
  }
  const untilMs = parseDateMs(args.until);
  if (args.until && untilMs === null) {
    throw new Error(`Invalid --until value: ${args.until}`);
  }
  const fromBlockOverride = parseBlockValue(args.fromBlock);
  if (args.fromBlock && fromBlockOverride === null) {
    throw new Error(`Invalid --from-block value: ${args.fromBlock}`);
  }

  log(`Loading report: ${args.report}`);
  const reportRaw = await Deno.readTextFile(args.report);
  const reportPermits = loadReportPermits(reportRaw);
  log(`Report permits: ${reportPermits.length}`);
  log(
    `Config: chunkSize=${args.chunkSize} concurrency=${concurrency} timeoutMs=${args.timeoutMs} fromBlock=${fromBlockOverride?.toString() ?? "none"}`
  );

  const skipped: Array<{ id: number | null; reason: string }> = [];
  const permits: PermitTarget[] = [];

  for (const entry of reportPermits) {
    const id = typeof entry.id === "number" ? entry.id : null;
    const chainId = typeof entry.chainId === "number" ? entry.chainId : null;
    const owner = typeof entry.owner === "string" ? normalizeHexAddress(entry.owner) : null;
    const nonceRaw = typeof entry.nonce === "string" || typeof entry.nonce === "number" ? String(entry.nonce) : null;
    const created = typeof entry.created === "string" ? entry.created : null;
    const createdMs = created ? Date.parse(created) : NaN;
    if (!id || !chainId || !owner || !nonceRaw || !created || !Number.isFinite(createdMs)) {
      skipped.push({ id, reason: "missing_required_fields" });
      continue;
    }
    if (ownerFilter && owner !== ownerFilter) continue;
    if (!isHexAddress(owner)) {
      skipped.push({ id, reason: "invalid_owner" });
      continue;
    }

    let nonce: bigint;
    try {
      nonce = BigInt(nonceRaw);
    } catch {
      skipped.push({ id, reason: "invalid_nonce" });
      continue;
    }

    const { wordPos, bitPos } = noncePositions(nonce);
    const expectedPermit2 = typeof entry.expectedPermit2 === "string" ? entry.expectedPermit2 : null;
    const expectedPermit2Address = typeof entry.expectedPermit2Address === "string" ? normalizeHexAddress(entry.expectedPermit2Address) : null;
    const permit2Addresses = pickPermit2Addresses({ expectedPermit2, expectedPermit2Address });

    permits.push({
      id,
      chainId,
      owner,
      nonce,
      wordPos,
      bitPos,
      created,
      createdMs,
      permit2Addresses,
      expectedPermit2,
      expectedPermit2Address,
      tokenSymbol: typeof entry.tokenSymbol === "string" ? entry.tokenSymbol : null,
      amountRaw: typeof entry.amountRaw === "string" ? entry.amountRaw : null,
      amountFormatted: typeof entry.amountFormatted === "string" ? entry.amountFormatted : null,
      githubUrl: typeof entry.githubUrl === "string" ? entry.githubUrl : null,
      beneficiary: typeof entry.beneficiary === "string" ? normalizeHexAddress(entry.beneficiary) : null,
      token: typeof entry.token === "string" ? normalizeHexAddress(entry.token) : null,
      signature: typeof entry.signature === "string" ? entry.signature.toLowerCase() as `0x${string}` : null,
    });
  }
  log(`Permits scanned: ${permits.length}; skipped: ${skipped.length}`);

  const groups = new Map<string, { chainId: number; permit2Address: `0x${string}`; owner: `0x${string}`; sinceMs: number; permits: PermitTarget[] }>();
  for (const permit of permits) {
    for (const permit2Address of permit.permit2Addresses) {
      const key = `${permit.chainId}:${permit2Address}:${permit.owner}`;
      const existing = groups.get(key) ?? { chainId: permit.chainId, permit2Address, owner: permit.owner, sinceMs: permit.createdMs, permits: [] };
      if (permit.createdMs < existing.sinceMs) existing.sinceMs = permit.createdMs;
      existing.permits.push(permit);
      groups.set(key, existing);
    }
  }
  const groupList = Array.from(groups.values());
  log(`Groups: ${groupList.length}`);

  const rpcBaseUrl = getRpcBaseUrlFromEnv();
  const errors: Array<{ chainId: number; permit2Address: `0x${string}`; owner: `0x${string}`; fromBlock: string; toBlock: string; error: string }> = [];
  const invalidations: InvalidationLog[] = [];
  const invalidationsByKey = new Map<string, InvalidationLog[]>();

  for (const [groupIndex, group] of groupList.entries()) {
    log(
      `Group ${groupIndex + 1}/${groupList.length} chain=${group.chainId} permit2=${group.permit2Address} owner=${group.owner} permits=${group.permits.length}`
    );
    const fromMs = sinceMs ?? group.sinceMs;
    let fromBlock = await findFirstBlockAtOrAfterTimestamp({
      rpcBaseUrl,
      chainId: group.chainId,
      targetTimestampSeconds: Math.floor(fromMs / 1000),
    });
    if (fromBlockOverride !== null && fromBlockOverride > fromBlock) {
      fromBlock = fromBlockOverride;
    }
    const latestHex = await rpcCall<string>({ rpcBaseUrl, chainId: group.chainId, method: "eth_blockNumber", params: [] });
    let latest = BigInt(latestHex);
    if (untilMs !== null) {
      const untilBlock = await findFirstBlockAtOrAfterTimestamp({
        rpcBaseUrl,
        chainId: group.chainId,
        targetTimestampSeconds: Math.floor(untilMs / 1000),
      });
      if (untilBlock < latest) latest = untilBlock;
    }

    if (fromBlock > latest) {
      log(`Skipping group: fromBlock ${fromBlock} > latest ${latest}`);
      continue;
    }

    const chunkSize = BigInt(args.chunkSize);
    const ranges: Array<{ start: bigint; end: bigint; index: bigint }> = [];
    let index = 0n;
    for (let cursor = fromBlock; cursor <= latest; cursor += chunkSize) {
      const end = cursor + chunkSize - 1n > latest ? latest : cursor + chunkSize - 1n;
      index += 1n;
      ranges.push({ start: cursor, end, index });
    }
    const totalChunks = BigInt(ranges.length);
    log(
      `Block range ${fromBlock.toString()}..${latest.toString()} chunkSize=${chunkSize.toString()} totalChunks=${totalChunks.toString()} concurrency=${concurrency}`
    );

    await runWithConcurrency(ranges, concurrency, async (range) => {
      const logs = await fetchInvalidationLogs({
        rpcBaseUrl,
        chainId: group.chainId,
        permit2Address: group.permit2Address,
        owner: group.owner,
        fromBlock: range.start,
        toBlock: range.end,
        useBlockscout: args.useBlockscout,
        errors,
      });
      log(
        `Chunk ${range.index.toString()}/${totalChunks.toString()} blocks ${range.start.toString()}..${range.end.toString()} logs=${logs.length}`
      );
      for (const log of logs) {
        const parsed = parseInvalidationLog({ chainId: group.chainId, permit2Address: group.permit2Address, owner: group.owner, log });
        if (!parsed) continue;
        invalidations.push(parsed);
        const key = `${parsed.chainId}:${parsed.permit2Address}:${parsed.owner}:${parsed.wordPos.toString()}`;
        const list = invalidationsByKey.get(key) ?? [];
        list.push(parsed);
        invalidationsByKey.set(key, list);
      }
    });
  }
  log(`Invalidations parsed: ${invalidations.length}; errors: ${errors.length}`);

  const matches: Array<{
    permitId: number;
    chainId: number;
    owner: `0x${string}`;
    nonce: string;
    wordPos: string;
    bitPos: string;
    permit2Addresses: `0x${string}`[];
    invalidations: Array<{ txHash: `0x${string}`; blockNumber: string; permit2Address: `0x${string}`; wordPos: string; mask: string }>;
  }> = [];
  const unmatched: Array<{ permitId: number; chainId: number; owner: `0x${string}`; nonce: string; wordPos: string; bitPos: string; permit2Addresses: `0x${string}`[] }> = [];
  const selectedInvalidations: SelectedInvalidation[] = [];

  for (const permit of permits) {
    const found: Array<{ txHash: `0x${string}`; blockNumber: string; permit2Address: `0x${string}`; wordPos: string; mask: string }> = [];
    for (const permit2Address of permit.permit2Addresses) {
      const key = `${permit.chainId}:${permit2Address}:${permit.owner}:${permit.wordPos.toString()}`;
      const invs = invalidationsByKey.get(key) ?? [];
      for (const inv of invs) {
        if (inv.mask & (1n << permit.bitPos)) {
          found.push({
            txHash: inv.txHash,
            blockNumber: inv.blockNumber.toString(),
            permit2Address: inv.permit2Address,
            wordPos: inv.wordPos.toString(),
            mask: inv.mask.toString(),
          });
        }
      }
    }
    if (found.length > 0) {
      const selection = pickInvalidation({
        permit,
        candidates: found.map((entry) => ({ txHash: entry.txHash, blockNumber: entry.blockNumber, permit2Address: entry.permit2Address })),
      });
      if (selection) {
        selectedInvalidations.push({
          permitId: permit.id,
          chainId: permit.chainId,
          owner: permit.owner,
          txHash: selection.txHash,
          blockNumber: selection.blockNumber,
          permit2Address: selection.permit2Address,
        });
      }
      matches.push({
        permitId: permit.id,
        chainId: permit.chainId,
        owner: permit.owner,
        nonce: permit.nonce.toString(),
        wordPos: permit.wordPos.toString(),
        bitPos: permit.bitPos.toString(),
        permit2Addresses: permit.permit2Addresses,
        invalidations: found,
      });
    } else {
      unmatched.push({
        permitId: permit.id,
        chainId: permit.chainId,
        owner: permit.owner,
        nonce: permit.nonce.toString(),
        wordPos: permit.wordPos.toString(),
        bitPos: permit.bitPos.toString(),
        permit2Addresses: permit.permit2Addresses,
      });
    }
  }

  let updateResult: Awaited<ReturnType<typeof updateInvalidationsInDb>> | null = null;
  let updateError: string | null = null;
  if (args.execute) {
    const { client: supabase, usesServiceRole } = createSupabaseClientFromEnv({ preferServiceRole: true });
    if (!usesServiceRole) {
      throw new Error("Refusing to --execute without SUPABASE_SERVICE_ROLE_KEY (service role required to bypass RLS for updates).");
    }
    console.error("Note: using SUPABASE_SERVICE_ROLE_KEY (bypasses RLS); results may differ from browser worker behavior.");
    try {
      updateResult = await updateInvalidationsInDb({ supabase, selected: selectedInvalidations, maxUpdates: args.maxUpdates });
      log(`DB update: updated=${updateResult.updated} conflicts=${updateResult.conflicts.length} missing=${updateResult.missing.length}`);
    } catch (error) {
      updateError = error instanceof Error ? error.message : String(error);
      updateResult = null;
      log(`DB update error: ${updateError}`);
    }
  }

  const report = {
    generatedAt: new Date().toISOString(),
    reportSource: args.report,
    rpcBaseUrl,
    useBlockscout: args.useBlockscout,
    concurrency,
    fromBlock: args.fromBlock ?? null,
    ownerFilter: ownerFilter ?? null,
    since: args.since ?? null,
    until: args.until ?? null,
    counts: {
      permitsTotal: reportPermits.length,
      permitsScanned: permits.length,
      permitsSkipped: skipped.length,
      invalidationLogs: invalidations.length,
      matchedPermits: matches.length,
      unmatchedPermits: unmatched.length,
      selectedInvalidations: selectedInvalidations.length,
      groups: groups.size,
      errors: errors.length,
    },
    skipped,
    invalidations,
    matches,
    unmatched,
    selectedInvalidations,
    errors,
    ...(args.execute
      ? { executed: true, updated: updateResult?.updated ?? 0, conflicts: updateResult?.conflicts ?? [], missing: updateResult?.missing ?? [], updateError }
      : { executed: false }),
  };

  const output = stringifyJson(report, args.pretty);
  if (args.out) {
    await Deno.writeTextFile(args.out, output);
    console.log(`Wrote report: ${args.out}`);
  } else {
    console.log(output);
  }
};

if (import.meta.main) {
  await main();
}
