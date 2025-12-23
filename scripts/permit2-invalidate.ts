#!/usr/bin/env -S deno run -A --ext=ts --env-file=.env

import { createPublicClient, createWalletClient, http, type Chain, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { arbitrum, base, gnosis, mainnet } from "viem/chains";
import permit2Abi from "../src/fixtures/permit2-abi.ts";
import {
  bitmapKey,
  createSupabaseClientFromEnv,
  fetchNonceBitmaps,
  fetchPermitsFromDb,
  getRpcBaseUrlFromEnv,
  inferPermit2,
  isHexAddress,
  isNonceUsed,
  NEW_PERMIT2_ADDRESS,
  noncePositions,
  OLD_PERMIT2_ADDRESS,
  normalizeHexAddress,
  type Permit2Kind,
  type PermitDbRowWithJoins,
  type NonceBitmapRef,
} from "./permit2-tools.ts";

type Target = "old" | "new" | "both";

type CliArgs = {
  owner: string;
  since?: string;
  target: Target;
  onlyDbUnclaimed: boolean;
  execute: boolean;
  out?: string;
  pretty: boolean;
  maxTxs: number;
  privateKeyEnv: string;
  help: boolean;
};

const printUsage = () => {
  console.error(
    `
Usage:
  deno run -A --env-file=.env scripts/permit2-invalidate.ts --owner 0x... [--target old|new|both] [--since <timestamp>]
    [--only-db-unclaimed] [--out <file>] [--pretty] [--execute] [--max-txs <n>] [--private-key-env <NAME>]

What it does:
  - Loads permits for a funding wallet (permit owner) from Supabase.
  - Infers whether each signature was signed for OLD vs NEW Permit2.
  - Builds an invalidation plan grouped by (chainId, permit2Address, wordPos) => one tx per group.
  - Optional: executes the plan by submitting on-chain invalidation txs.

Options:
  -o, --owner             Funding wallet (permit owner). Required.
  -s, --since             Only include permits created after this timestamp.
      --target            Which permits to invalidate by inferred Permit2 kind: old | new | both (default: old).
      --only-db-unclaimed Only include rows where permits.transaction IS NULL (default: false).
      --execute           Actually send transactions (default: false; plan-only).
      --max-txs           Safety limit for execution (default: 25).
      --private-key-env   Env var name holding the owner's private key (default: INVALIDATOR_PRIVATE_KEY).
      --out               Write plan/report JSON to a file (otherwise prints to stdout).
  -p, --pretty            Pretty-print JSON.
  -h, --help              Show help.

Env:
  SUPABASE_URL or VITE_SUPABASE_URL
  SUPABASE_ANON_KEY or VITE_SUPABASE_ANON_KEY (fallback: SUPABASE_SERVICE_ROLE_KEY)
  RPC_URL or VITE_RPC_URL (optional, defaults to https://rpc.ubq.fi)

Execution env:
  INVALIDATOR_PRIVATE_KEY (or your chosen --private-key-env) must be 0x + 64 hex chars
    `.trim()
  );
};

const parseArgs = (argv: string[]): CliArgs => {
  const out: Omit<CliArgs, "owner"> = {
    target: "old",
    onlyDbUnclaimed: false,
    execute: false,
    pretty: false,
    maxTxs: 25,
    privateKeyEnv: "INVALIDATOR_PRIVATE_KEY",
    help: false,
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
    if (arg === "--only-db-unclaimed") {
      out.onlyDbUnclaimed = true;
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
    if (arg === "--target") {
      const v = takeValue(arg, argv[i + 1]);
      i += 1;
      if (v !== "old" && v !== "new" && v !== "both") throw new Error(`Invalid --target: ${v}`);
      out.target = v;
      continue;
    }
    if (arg.startsWith("--target=")) {
      const v = arg.slice("--target=".length);
      if (v !== "old" && v !== "new" && v !== "both") throw new Error(`Invalid --target: ${v}`);
      out.target = v;
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
    if (arg === "--max-txs") {
      const v = Number(takeValue(arg, argv[i + 1]));
      i += 1;
      if (!Number.isFinite(v) || v <= 0) throw new Error(`Invalid --max-txs: ${argv[i]}`);
      out.maxTxs = Math.floor(v);
      continue;
    }
    if (arg.startsWith("--max-txs=")) {
      const v = Number(arg.slice("--max-txs=".length));
      if (!Number.isFinite(v) || v <= 0) throw new Error(`Invalid --max-txs: ${v}`);
      out.maxTxs = Math.floor(v);
      continue;
    }
    if (arg === "--private-key-env") {
      out.privateKeyEnv = takeValue(arg, argv[i + 1]);
      i += 1;
      continue;
    }
    if (arg.startsWith("--private-key-env=")) {
      out.privateKeyEnv = arg.slice("--private-key-env=".length);
      continue;
    }
    if (arg.startsWith("-")) throw new Error(`Unknown option: ${arg}`);
    throw new Error(`Unexpected positional arg: ${arg}`);
  }

  if (!owner) throw new Error("Missing --owner");
  return { owner, ...out };
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

type InvalidationPermit = {
  id: number;
  chainId: number;
  permit2Address: `0x${string}`;
  permit2Kind: Permit2Kind;
  nonce: string;
  wordPos: string;
  bitPos: string;
  maskBit: string;
  signature: `0x${string}`;
  githubUrl: string | null;
  dbTransaction: `0x${string}` | null;
};

type InvalidationCall = {
  chainId: number;
  permit2Address: `0x${string}`;
  wordPos: string;
  mask: Hex;
  permitCount: number;
  permits: InvalidationPermit[];
  txHash?: `0x${string}`;
};

function safe0xTxHash(value: string | null): `0x${string}` | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!/^0x[0-9a-fA-F]{64}$/.test(trimmed)) return null;
  return trimmed.toLowerCase() as `0x${string}`;
}

function safe0xHex(value: string | null | undefined): `0x${string}` | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!/^0x[0-9a-fA-F]+$/.test(trimmed)) return null;
  return trimmed.toLowerCase() as `0x${string}`;
}

function getChain(chainId: number, rpcUrl: string): Chain {
  const known = new Map<number, Chain>([
    [mainnet.id, mainnet],
    [gnosis.id, gnosis],
    [base.id, base],
    [arbitrum.id, arbitrum],
  ]);
  const existing = known.get(chainId);
  if (existing) return existing;
  return {
    id: chainId,
    name: `Chain ${chainId}`,
    nativeCurrency: { name: "Native", symbol: "NATIVE", decimals: 18 },
    rpcUrls: { default: { http: [rpcUrl] } },
  } as Chain;
}

async function buildInvalidationPlan({
  rows,
  rpcBaseUrl,
  target,
  onlyDbUnclaimed,
}: {
  rows: PermitDbRowWithJoins[];
  rpcBaseUrl: string;
  target: Target;
  onlyDbUnclaimed: boolean;
}): Promise<{
  calls: InvalidationCall[];
  selectedPermitCount: number;
  skipped: { reason: string; count: number }[];
}> {
  const skippedCounts = new Map<string, number>();
  const selectedDraft: {
    row: PermitDbRowWithJoins;
    chainId: number;
    permit2Kind: Permit2Kind;
    permit2Address: `0x${string}`;
    owner: `0x${string}`;
    signature: `0x${string}`;
    nonce: bigint;
    wordPos: bigint;
    bitPos: bigint;
  }[] = [];

  const pushSkip = (reason: string) => skippedCounts.set(reason, (skippedCounts.get(reason) ?? 0) + 1);

  for (const row of rows) {
    if (onlyDbUnclaimed && row.transaction) {
      pushSkip("db_transaction_set");
      continue;
    }

    const tokenAddress = safe0xHex(row.token?.address ?? null);
    const chainId = row.token?.network !== null && row.token?.network !== undefined ? Number(row.token.network) : null;
    const owner = safe0xHex(row.partner?.wallet?.address ?? null);
    const beneficiary = safe0xHex(row.users?.wallets?.address ?? null);
    const signature = safe0xHex(row.signature ?? null);

    if (!chainId || !tokenAddress || !owner || !beneficiary || !signature) {
      pushSkip("missing_required_fields");
      continue;
    }

    let nonce: bigint;
    try {
      nonce = BigInt(row.nonce);
    } catch {
      pushSkip("invalid_nonce");
      continue;
    }
    const { wordPos, bitPos } = noncePositions(nonce);

    const inferred = await inferPermit2({
      chainId,
      tokenAddress,
      amount: BigInt(row.amount),
      nonce,
      deadline: BigInt(row.deadline),
      beneficiary,
      owner,
      signature,
    });

    if (inferred.kind === "unknown" || !inferred.expectedPermit2Address) {
      pushSkip("permit2_inference_failed");
      continue;
    }

    if (target !== "both" && inferred.kind !== target) {
      pushSkip("excluded_by_target");
      continue;
    }

    selectedDraft.push({
      row,
      chainId,
      permit2Kind: inferred.kind,
      permit2Address: inferred.expectedPermit2Address,
      owner,
      signature,
      nonce,
      wordPos,
      bitPos,
    });
  }

  // Only fetch nonceBitmaps for the (chainId, permit2Address, owner, wordPos) combos we actually need.
  const refs: NonceBitmapRef[] = [];
  for (const p of selectedDraft) {
    refs.push({ chainId: p.chainId, permit2Address: p.permit2Address, owner: p.owner, wordPos: p.wordPos });
  }

  const uniqRefKey = new Set<string>();
  const uniqRefs: NonceBitmapRef[] = [];
  for (const ref of refs) {
    const key = bitmapKey(ref);
    if (uniqRefKey.has(key)) continue;
    uniqRefKey.add(key);
    uniqRefs.push(ref);
  }

  const bitmapResults = await fetchNonceBitmaps({ rpcBaseUrl, refs: uniqRefs });

  const isUsedExpected = (p: (typeof selectedDraft)[number]): { used: boolean | null; error?: string } => {
    const key = `${p.chainId}:${p.permit2Address.toLowerCase()}:${p.owner.toLowerCase()}:${p.wordPos.toString()}`;
    const res = bitmapResults.get(key);
    if (!res) return { used: null, error: "Missing bitmap result" };
    if ("error" in res) return { used: null, error: res.error };
    return { used: isNonceUsed({ bitmap: res.bitmap, bitPos: p.bitPos }) };
  };

  const grouped = new Map<string, { chainId: number; permit2Address: `0x${string}`; wordPos: bigint; mask: bigint; permits: InvalidationPermit[] }>();

  for (const p of selectedDraft) {
    const { used, error } = isUsedExpected(p);
    if (error) {
      pushSkip("bitmap_error");
      continue;
    }
    if (used === true) {
      pushSkip("already_used_onchain");
      continue;
    }
    if (used === null) {
      pushSkip("unknown_nonce_state");
      continue;
    }

    const groupKey = `${p.chainId}:${p.permit2Address.toLowerCase()}:${p.wordPos.toString()}`;
    const existing = grouped.get(groupKey) ?? { chainId: p.chainId, permit2Address: p.permit2Address, wordPos: p.wordPos, mask: 0n, permits: [] };
    existing.mask |= 1n << p.bitPos;

    const githubUrl = p.row.location?.node_url ? String(p.row.location.node_url) : null;
    existing.permits.push({
      id: p.row.id,
      chainId: p.chainId,
      permit2Address: p.permit2Address,
      permit2Kind: p.permit2Kind,
      nonce: String(p.row.nonce),
      wordPos: p.wordPos.toString(),
      bitPos: p.bitPos.toString(),
      maskBit: `0x${(1n << p.bitPos).toString(16)}`,
      signature: p.signature,
      githubUrl,
      dbTransaction: safe0xTxHash(p.row.transaction),
    });

    grouped.set(groupKey, existing);
  }

  const calls: InvalidationCall[] = Array.from(grouped.values())
    .map((g) => ({
      chainId: g.chainId,
      permit2Address: g.permit2Address,
      wordPos: g.wordPos.toString(),
      mask: `0x${g.mask.toString(16)}` as Hex,
      permitCount: g.permits.length,
      permits: g.permits,
    }))
    .sort((a, b) => {
      if (a.chainId !== b.chainId) return a.chainId - b.chainId;
      if (a.permit2Address.toLowerCase() !== b.permit2Address.toLowerCase()) return a.permit2Address.toLowerCase() < b.permit2Address.toLowerCase() ? -1 : 1;
      const aw = BigInt(a.wordPos);
      const bw = BigInt(b.wordPos);
      return aw < bw ? -1 : aw > bw ? 1 : 0;
    });

  const skipped = Array.from(skippedCounts.entries())
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count);

  const selectedPermitCount = calls.reduce((sum, c) => sum + c.permitCount, 0);
  return { calls, selectedPermitCount, skipped };
}

async function executePlan({
  calls,
  owner,
  rpcBaseUrl,
  privateKey,
}: {
  calls: InvalidationCall[];
  owner: `0x${string}`;
  rpcBaseUrl: string;
  privateKey: Hex;
}): Promise<InvalidationCall[]> {
  const account = privateKeyToAccount(privateKey);
  if (account.address.toLowerCase() !== owner.toLowerCase()) {
    throw new Error(`Private key address ${account.address} does not match --owner ${owner}`);
  }

  const clientByChain = new Map<number, { publicClient: ReturnType<typeof createPublicClient>; walletClient: ReturnType<typeof createWalletClient> }>();

  for (const call of calls) {
    if (clientByChain.has(call.chainId)) continue;
    const rpcUrl = `${rpcBaseUrl}/${call.chainId}`;
    const chain = getChain(call.chainId, rpcUrl);
    const transport = http(rpcUrl);
    clientByChain.set(call.chainId, {
      publicClient: createPublicClient({ chain, transport }),
      walletClient: createWalletClient({ chain, transport, account }),
    });
  }

  const executed: InvalidationCall[] = [];
  for (const call of calls) {
    const clients = clientByChain.get(call.chainId);
    if (!clients) throw new Error(`Missing client for chain ${call.chainId}`);

    const wordPos = BigInt(call.wordPos);
    const mask = BigInt(call.mask);

    const { request } = await clients.publicClient.simulateContract({
      address: call.permit2Address,
      abi: permit2Abi,
      functionName: "invalidateUnorderedNonces",
      args: [wordPos, mask],
      account,
    });

    const txHash = await clients.walletClient.writeContract(request);
    const receipt = await clients.publicClient.waitForTransactionReceipt({ hash: txHash });
    if (receipt.status !== "success") {
      throw new Error(`Invalidation tx failed: ${txHash}`);
    }

    executed.push({ ...call, txHash });
  }

  return executed;
}

const isHexPrivateKey = (value: string) => /^0x[0-9a-fA-F]{64}$/.test(value.trim());

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
  const { client: supabase, usesServiceRole } = createSupabaseClientFromEnv();
  if (usesServiceRole) {
    console.error("Note: using SUPABASE_SERVICE_ROLE_KEY (bypasses RLS); results may differ from browser worker behavior.");
  }

  const rpcBaseUrl = getRpcBaseUrlFromEnv();
  const rows = await fetchPermitsFromDb({ supabase, owner: owner, since: args.since });

  const { calls, selectedPermitCount, skipped } = await buildInvalidationPlan({
    rows,
    rpcBaseUrl,
    target: args.target,
    onlyDbUnclaimed: args.onlyDbUnclaimed,
  });

  const summary = {
    owner,
    since: args.since ?? null,
    rpcBaseUrl,
    permit2: { old: OLD_PERMIT2_ADDRESS, new: NEW_PERMIT2_ADDRESS },
    target: args.target,
    onlyDbUnclaimed: args.onlyDbUnclaimed,
    fetchedRowCount: rows.length,
    selectedPermitCount,
    txCount: calls.length,
    skipped,
  };

  let executedCalls: InvalidationCall[] | null = null;
  let executeError: string | null = null;

  if (args.execute) {
    if (calls.length > args.maxTxs) {
      throw new Error(`Refusing to execute ${calls.length} txs (exceeds --max-txs ${args.maxTxs}). Re-run with a higher --max-txs if intended.`);
    }

    const rawKey = Deno.env.get(args.privateKeyEnv)?.trim();
    if (!rawKey || !isHexPrivateKey(rawKey)) {
      throw new Error(`Missing/invalid private key in env var ${args.privateKeyEnv} (expected 0x + 64 hex chars).`);
    }

    try {
      executedCalls = await executePlan({ calls, owner, rpcBaseUrl, privateKey: rawKey as Hex });
    } catch (error) {
      executeError = error instanceof Error ? error.message : String(error);
      executedCalls = null;
    }
  }

  const report = {
    generatedAt: new Date().toISOString(),
    ...summary,
    calls: args.execute ? (executedCalls ?? calls) : calls,
    ...(args.execute ? { executed: Boolean(executedCalls), executeError } : { executed: false }),
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
