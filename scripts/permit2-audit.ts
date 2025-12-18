#!/usr/bin/env -S deno run -A --ext=ts --env-file=.env

import { formatUnits } from "viem";
import { getTokenInfo } from "../src/constants/supported-reward-tokens.ts";
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
  type Permit2Kind,
  type PermitDbRowWithJoins,
  type NonceBitmapRef,
  type NonceBitmapResult,
} from "./permit2-tools.ts";

type CliArgs = {
  owner?: string;
  since?: string;
  out?: string;
  pretty: boolean;
  includePermits: boolean;
  help: boolean;
};

const printUsage = () => {
  console.error(
    `
Usage:
  deno run -A --env-file=.env scripts/permit2-audit.ts [--owner 0x...] [--since <timestamp>] [--out <file>] [--include-permits] [--pretty]

What it does:
  - Loads permits from Supabase.
  - Infers whether each signature was signed for OLD vs NEW Permit2.
  - Checks nonce usage on-chain on BOTH contracts (old + new) via nonceBitmap.
  - Emits a JSON report highlighting mismatches (e.g. nonce used but DB tx missing).

Options:
  -o, --owner            Funding wallet (permit owner) to filter by.
  -s, --since            Only include permits created after this timestamp (Date.parse-able).
      --out              Write report JSON to a file (otherwise prints to stdout).
      --include-permits  Include full permit list in the report (otherwise only summary + anomalies).
  -p, --pretty           Pretty-print JSON.
  -h, --help             Show help.

Env:
  SUPABASE_URL or VITE_SUPABASE_URL
  SUPABASE_ANON_KEY or VITE_SUPABASE_ANON_KEY (fallback: SUPABASE_SERVICE_ROLE_KEY)
  RPC_URL or VITE_RPC_URL (optional, defaults to https://rpc.ubq.fi)
    `.trim()
  );
};

const parseArgs = (argv: string[]): CliArgs => {
  const out: CliArgs = { pretty: false, help: false, includePermits: false };
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
    if (arg === "--include-permits") {
      out.includePermits = true;
      continue;
    }
    if (arg === "--owner" || arg === "-o") {
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
    if (arg === "--out") {
      out.out = takeValue(arg, argv[i + 1]);
      i += 1;
      continue;
    }
    if (arg.startsWith("--out=")) {
      out.out = arg.slice("--out=".length);
      continue;
    }
    if (arg.startsWith("-")) throw new Error(`Unknown option: ${arg}`);
    throw new Error(`Unexpected positional arg: ${arg}`);
  }

  return out;
};

type PermitAuditEntry = {
  id: number;
  created: string;
  chainId: number | null;
  token: `0x${string}` | null;
  tokenSymbol: string | null;
  amountRaw: string;
  amountFormatted: string | null;
  owner: `0x${string}` | null;
  beneficiary: `0x${string}` | null;
  githubUrl: string | null;
  signature: `0x${string}`;
  nonce: string;
  wordPos: string | null;
  bitPos: string | null;
  dbTransaction: `0x${string}` | null;
  expectedPermit2: Permit2Kind;
  expectedPermit2Address: `0x${string}` | null;
  nonceUsed: {
    old: boolean | null;
    new: boolean | null;
    expected: boolean | null;
  };
  bitmapErrors: {
    old?: string;
    new?: string;
  };
  inferenceError?: string;
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

function formatAmount({ chainId, tokenAddress, rawAmount }: { chainId: number | null; tokenAddress: `0x${string}` | null; rawAmount: string }): {
  symbol: string | null;
  formatted: string | null;
} {
  if (!chainId || !tokenAddress) return { symbol: null, formatted: null };
  const tokenInfo = getTokenInfo(chainId, tokenAddress);
  if (!tokenInfo) {
    try {
      return { symbol: null, formatted: formatUnits(BigInt(rawAmount), 18) };
    } catch {
      return { symbol: null, formatted: null };
    }
  }
  try {
    return { symbol: tokenInfo.symbol, formatted: formatUnits(BigInt(rawAmount), tokenInfo.decimals) };
  } catch {
    return { symbol: tokenInfo.symbol, formatted: null };
  }
}

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

async function buildAuditEntries(rows: PermitDbRowWithJoins[], rpcBaseUrl: string): Promise<PermitAuditEntry[]> {
  const refs: NonceBitmapRef[] = [];
  const draft: {
    row: PermitDbRowWithJoins;
    chainId: number | null;
    token: `0x${string}` | null;
    owner: `0x${string}` | null;
    beneficiary: `0x${string}` | null;
    signature: `0x${string}`;
    nonceBigint: bigint | null;
    wordPos: bigint | null;
    bitPos: bigint | null;
    expected: { kind: Permit2Kind; address: `0x${string}` | null; error?: string };
  }[] = [];

  for (const row of rows) {
    const tokenAddress = safe0xHex(row.token?.address ?? null);
    const chainId = row.token?.network !== null && row.token?.network !== undefined ? Number(row.token.network) : null;
    const owner = safe0xHex(row.partner?.wallet?.address ?? null);
    const beneficiary = safe0xHex(row.users?.wallets?.address ?? null);
    const signature = safe0xHex(row.signature ?? null);

    let nonceBigint: bigint | null = null;
    let wordPos: bigint | null = null;
    let bitPos: bigint | null = null;
    try {
      nonceBigint = BigInt(row.nonce);
      const positions = noncePositions(nonceBigint);
      wordPos = positions.wordPos;
      bitPos = positions.bitPos;
    } catch {
      nonceBigint = null;
    }

    let expected: { kind: Permit2Kind; address: `0x${string}` | null; error?: string } = { kind: "unknown", address: null };
    if (chainId && tokenAddress && owner && beneficiary && signature && nonceBigint !== null) {
      const inferred = await inferPermit2({
        chainId,
        tokenAddress,
        amount: BigInt(row.amount),
        nonce: nonceBigint,
        deadline: BigInt(row.deadline),
        beneficiary,
        owner,
        signature,
      });
      expected = { kind: inferred.kind, address: inferred.expectedPermit2Address, ...(inferred.error && { error: inferred.error }) };
    }

    if (chainId && owner && wordPos !== null) {
      refs.push({ chainId, permit2Address: OLD_PERMIT2_ADDRESS, owner, wordPos });
      refs.push({ chainId, permit2Address: NEW_PERMIT2_ADDRESS, owner, wordPos });
    }

    if (!signature) {
      // Skip impossible rows, but keep a placeholder signature so downstream types hold.
      continue;
    }

    draft.push({ row, chainId, token: tokenAddress, owner, beneficiary, signature, nonceBigint, wordPos, bitPos, expected });
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

  const getUsed = ({
    chainId,
    permit2Address,
    owner,
    wordPos,
    bitPos,
  }: {
    chainId: number;
    permit2Address: `0x${string}`;
    owner: `0x${string}`;
    wordPos: bigint;
    bitPos: bigint;
  }): { used: boolean | null; error?: string } => {
    const key = `${chainId}:${permit2Address.toLowerCase()}:${owner.toLowerCase()}:${wordPos.toString()}`;
    const res = bitmapResults.get(key);
    if (!res) return { used: null, error: "Missing bitmap result" };
    if ("error" in res) return { used: null, error: res.error };
    return { used: isNonceUsed({ bitmap: res.bitmap, bitPos }) };
  };

  return draft.map((d): PermitAuditEntry => {
    const formatted = formatAmount({ chainId: d.chainId, tokenAddress: d.token, rawAmount: d.row.amount });
    const dbTx = safe0xTxHash(d.row.transaction);
    const githubUrl = d.row.location?.node_url ? String(d.row.location.node_url) : null;

    const usedOld =
      d.chainId && d.owner && d.wordPos !== null && d.bitPos !== null
        ? getUsed({ chainId: d.chainId, permit2Address: OLD_PERMIT2_ADDRESS, owner: d.owner, wordPos: d.wordPos, bitPos: d.bitPos })
        : { used: null as boolean | null };
    const usedNew =
      d.chainId && d.owner && d.wordPos !== null && d.bitPos !== null
        ? getUsed({ chainId: d.chainId, permit2Address: NEW_PERMIT2_ADDRESS, owner: d.owner, wordPos: d.wordPos, bitPos: d.bitPos })
        : { used: null as boolean | null };

    const usedExpected = (() => {
      if (d.expected.kind === "old") return usedOld.used;
      if (d.expected.kind === "new") return usedNew.used;
      return null;
    })();

    return {
      id: d.row.id,
      created: String(d.row.created),
      chainId: d.chainId,
      token: d.token,
      tokenSymbol: formatted.symbol,
      amountRaw: String(d.row.amount),
      amountFormatted: formatted.formatted ? (formatted.symbol ? `${formatted.formatted} ${formatted.symbol}` : formatted.formatted) : null,
      owner: d.owner,
      beneficiary: d.beneficiary,
      githubUrl,
      signature: d.signature,
      nonce: String(d.row.nonce),
      wordPos: d.wordPos !== null ? d.wordPos.toString() : null,
      bitPos: d.bitPos !== null ? d.bitPos.toString() : null,
      dbTransaction: dbTx,
      expectedPermit2: d.expected.kind,
      expectedPermit2Address: d.expected.address,
      nonceUsed: { old: usedOld.used, new: usedNew.used, expected: usedExpected },
      bitmapErrors: {
        ...(usedOld.error ? { old: usedOld.error } : {}),
        ...(usedNew.error ? { new: usedNew.error } : {}),
      },
      ...(d.expected.error ? { inferenceError: d.expected.error } : {}),
    };
  });
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

  if (args.owner && !isHexAddress(args.owner)) {
    console.error("Invalid --owner (expected 0x + 40 hex chars).");
    console.error("");
    printUsage();
    Deno.exit(1);
    return;
  }

  const { client: supabase, usesServiceRole } = createSupabaseClientFromEnv();
  if (usesServiceRole) {
    console.error("Note: using SUPABASE_SERVICE_ROLE_KEY (bypasses RLS); results may differ from browser worker behavior.");
  }

  const rpcBaseUrl = getRpcBaseUrlFromEnv();
  const rows = await fetchPermitsFromDb({ supabase, owner: args.owner, since: args.since });
  const permits = await buildAuditEntries(rows, rpcBaseUrl);

  const counts = {
    total: permits.length,
    expectedOld: permits.filter((p) => p.expectedPermit2 === "old").length,
    expectedNew: permits.filter((p) => p.expectedPermit2 === "new").length,
    expectedUnknown: permits.filter((p) => p.expectedPermit2 === "unknown").length,
    dbTransactionSet: permits.filter((p) => p.dbTransaction !== null).length,
    dbTransactionNull: permits.filter((p) => p.dbTransaction === null).length,
    nonceUsedExpectedTrue: permits.filter((p) => p.nonceUsed.expected === true).length,
    nonceUsedExpectedFalse: permits.filter((p) => p.nonceUsed.expected === false).length,
    nonceUsedExpectedNull: permits.filter((p) => p.nonceUsed.expected === null).length,
  };

  const anomalies = {
    onChainUsedButDbTransactionNull: permits.filter((p) => p.nonceUsed.expected === true && p.dbTransaction === null),
    dbTransactionSetButNonceUnused: permits.filter((p) => p.dbTransaction !== null && p.nonceUsed.expected === false),
    expectedOldButUsedNew: permits.filter((p) => p.expectedPermit2 === "old" && p.nonceUsed.old === false && p.nonceUsed.new === true),
    expectedNewButUsedOld: permits.filter((p) => p.expectedPermit2 === "new" && p.nonceUsed.new === false && p.nonceUsed.old === true),
    nonceUsedOnBothContracts: permits.filter((p) => p.nonceUsed.old === true && p.nonceUsed.new === true),
    inferenceErrors: permits.filter((p) => Boolean(p.inferenceError)),
    bitmapErrors: permits.filter((p) => Boolean(p.bitmapErrors.old || p.bitmapErrors.new)),
  };

  const report = {
    generatedAt: new Date().toISOString(),
    ownerFilter: args.owner ? args.owner.toLowerCase() : null,
    since: args.since ?? null,
    rpcBaseUrl,
    permit2: {
      old: OLD_PERMIT2_ADDRESS,
      new: NEW_PERMIT2_ADDRESS,
    },
    counts,
    anomalies: Object.fromEntries(Object.entries(anomalies).map(([key, value]) => [key, { count: value.length, permits: value }])) as Record<
      string,
      { count: number; permits: PermitAuditEntry[] }
    >,
    ...(args.includePermits ? { permits } : {}),
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
