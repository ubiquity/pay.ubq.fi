#!/usr/bin/env -S deno run -A --env-file=.env --ext=ts

import {
  bitmapKey,
  createSupabaseClientFromEnv,
  fetchNonceBitmaps,
  getRpcBaseUrlFromEnv,
  isHexAddress,
  isNonceUsed,
  noncePositions,
  normalizeHexAddress,
  type NonceBitmapRef,
} from "./permit2-tools.ts";
import { fetchPermitsFromDb, mapDbPermitToPermitDataWithIssues, type PermitRow } from "../src/workers/permit-checker.logic.ts";

type CliArgs = {
  whitelistPath?: string;
  chainId: number;
  limit: number;
  offset: number;
  permitOffset: number;
  beneficiary?: string;
  beneficiaryUserId?: number;
  count: number;
  execute: boolean;
  batch: boolean;
  seed: boolean;
  claim: boolean;
  useExisting: boolean;
  claimPrivateKeyEnv: string;
  noWait: boolean;
  waitTimeoutMs: number;
  recordTransaction: boolean;
  proxyUrl?: string;
  startProxy: boolean;
  proxyRoot?: string;
  proxyPort: number;
  proxyLogLevel: string;
  proxyReadyTimeoutMs: number;
  proxyFallback: boolean;
  skipOnchainCheck: boolean;
  out?: string;
  pretty: boolean;
  failFast: boolean;
  help: boolean;
};

type SeedReport = {
  inserted?: number;
  permits?: Array<{ id?: number; nonce?: string; signature?: string }>;
};

type ClaimReport = {
  transactions?: Array<{
    txHash?: string;
    rawSignedTransaction?: string;
    receiptStatus?: string;
    recordStatus?: string;
    recordError?: string;
  }>;
};

type ProviderResult = {
  rpcUrl: string;
  seed?: {
    ok: boolean;
    outputPath?: string;
    permitIds?: number[];
    error?: string;
  };
  claim?: {
    ok: boolean;
    outputPath?: string;
    error?: string;
    warnings?: string[];
  };
  elapsedMs: number;
};

const DEFAULT_CHAIN_ID = 100;
const PROXY_OVERRIDE_HEADER = "x-ubq-rpc-candidates";
const PROXY_FALLBACK_HEADER = "x-ubq-rpc-fallback";

const printUsage = () => {
  console.error(
    `
Usage:
  deno run -A --env-file=.env scripts/permit2-test-upstream-rpcs.ts --whitelist <file> --beneficiary 0x... [options]

What it does:
  - Iterates whitelisted upstream RPCs for a chain.
  - Seeds one permit per RPC (optional) and claims it via that RPC (sign-only by default).

Options:
  --whitelist <file>      Path to rpc-whitelist.json (required).
  --chain-id <id>         Chain id to test (default: ${DEFAULT_CHAIN_ID}).
  --beneficiary <addr>    Beneficiary wallet address (required).
  --beneficiary-user-id   GitHub user id if the beneficiary has no user row.
  --count <n>             Permits to seed per RPC (default: 1).
  --limit <n>             Limit number of RPCs tested (default: 0 = all).
  --offset <n>            Skip first N RPCs (default: 0).
  --permit-offset <n>     Skip first N eligible permits (default: 0).
  --seed                  Run seed step (default: true).
  --claim                 Run claim step (default: true).
  --no-seed               Skip seeding permits.
  --no-claim              Skip claiming permits.
  --use-existing          Use existing unclaimed permits instead of seeding new ones.
  --execute               Broadcast claim txs (default: false; sign-only).
  --claim-private-key-env Env var for the beneficiary private key (default: BENEFICIARY_PRIVATE_KEY).
  --batch                 Use batchPermitTransferFrom in claim step.
  --no-wait               Skip waiting for receipts after broadcast.
  --wait-timeout-ms       Receipt wait timeout in ms (default: 120000).
  --record-transaction    Record tx hash to Supabase after broadcast (default: true).
  --no-record-transaction Skip recording tx hash to Supabase.
  --proxy-url <url>       Route claim txs through local proxy (base URL, no /<chainId>).
  --start-proxy           Start local permit2-rpc-server before running tests.
  --proxy-root <path>     Path to permit2-rpc-manager repo (required for --start-proxy).
  --proxy-port <n>        Port for local proxy (default: 8000).
  --proxy-log-level <lvl> Proxy log level (debug|info|warn|error|none; default: debug).
  --proxy-timeout-ms <n>  Wait timeout for proxy readiness (default: 20000).
  --proxy-no-fallback     Disable fallback to other upstreams when forcing an RPC.
  --skip-onchain-check    Skip nonceBitmap checks during seeding or existing permit filtering.
  --out <file>            Write summary JSON to a file.
  --pretty                Pretty-print JSON output.
  --fail-fast             Stop on first failure.
  --help, -h              Show help.

Notes:
  - This uses scripts/permit2-seed-test-permits.ts and scripts/permit2-claim-test-permits.ts.
  - Claiming uses --rpc-url to hit the upstream RPC directly (no /<chainId> suffix).
  - When --proxy-url is set, claims go to the proxy with override headers per upstream RPC.
  - Ensure SUPABASE_* and private keys are present in .env before running.
`.trim()
  );
};

const parseArgs = (argv: string[]): CliArgs => {
  const out: CliArgs = {
    chainId: DEFAULT_CHAIN_ID,
    limit: 0,
    offset: 0,
    permitOffset: 0,
    count: 1,
    execute: false,
    batch: false,
    seed: true,
    claim: true,
    useExisting: false,
    claimPrivateKeyEnv: "BENEFICIARY_PRIVATE_KEY",
    noWait: false,
    waitTimeoutMs: 120000,
    recordTransaction: true,
    proxyUrl: undefined,
    startProxy: false,
    proxyRoot: undefined,
    proxyPort: 8000,
    proxyLogLevel: "debug",
    proxyReadyTimeoutMs: 20000,
    proxyFallback: true,
    skipOnchainCheck: false,
    pretty: false,
    failFast: false,
    help: false,
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
    if (arg === "--pretty") {
      out.pretty = true;
      continue;
    }
    if (arg === "--execute") {
      out.execute = true;
      continue;
    }
    if (arg === "--batch") {
      out.batch = true;
      continue;
    }
    if (arg === "--seed") {
      out.seed = true;
      continue;
    }
    if (arg === "--claim") {
      out.claim = true;
      continue;
    }
    if (arg === "--no-seed") {
      out.seed = false;
      continue;
    }
    if (arg === "--no-claim") {
      out.claim = false;
      continue;
    }
    if (arg === "--use-existing") {
      out.useExisting = true;
      continue;
    }
    if (arg === "--claim-private-key-env") {
      out.claimPrivateKeyEnv = takeValue(arg, argv[i + 1]);
      i += 1;
      continue;
    }
    if (arg.startsWith("--claim-private-key-env=")) {
      out.claimPrivateKeyEnv = arg.slice("--claim-private-key-env=".length);
      continue;
    }
    if (arg === "--no-wait") {
      out.noWait = true;
      continue;
    }
    if (arg === "--record-transaction") {
      out.recordTransaction = true;
      continue;
    }
    if (arg === "--no-record-transaction") {
      out.recordTransaction = false;
      continue;
    }
    if (arg === "--wait-timeout-ms") {
      const v = Number(takeValue(arg, argv[i + 1]));
      i += 1;
      if (!Number.isFinite(v) || v < 0) throw new Error(`Invalid --wait-timeout-ms: ${argv[i]}`);
      out.waitTimeoutMs = Math.floor(v);
      continue;
    }
    if (arg.startsWith("--wait-timeout-ms=")) {
      const v = Number(arg.slice("--wait-timeout-ms=".length));
      if (!Number.isFinite(v) || v < 0) throw new Error(`Invalid --wait-timeout-ms: ${v}`);
      out.waitTimeoutMs = Math.floor(v);
      continue;
    }
    if (arg === "--proxy-url") {
      out.proxyUrl = takeValue(arg, argv[i + 1]);
      i += 1;
      continue;
    }
    if (arg.startsWith("--proxy-url=")) {
      out.proxyUrl = arg.slice("--proxy-url=".length);
      continue;
    }
    if (arg === "--start-proxy") {
      out.startProxy = true;
      continue;
    }
    if (arg === "--proxy-root") {
      out.proxyRoot = takeValue(arg, argv[i + 1]);
      i += 1;
      continue;
    }
    if (arg.startsWith("--proxy-root=")) {
      out.proxyRoot = arg.slice("--proxy-root=".length);
      continue;
    }
    if (arg === "--proxy-port") {
      const v = Number(takeValue(arg, argv[i + 1]));
      i += 1;
      if (!Number.isFinite(v) || v <= 0) throw new Error(`Invalid --proxy-port: ${argv[i]}`);
      out.proxyPort = Math.floor(v);
      continue;
    }
    if (arg.startsWith("--proxy-port=")) {
      const v = Number(arg.slice("--proxy-port=".length));
      if (!Number.isFinite(v) || v <= 0) throw new Error(`Invalid --proxy-port: ${v}`);
      out.proxyPort = Math.floor(v);
      continue;
    }
    if (arg === "--proxy-log-level") {
      out.proxyLogLevel = takeValue(arg, argv[i + 1]);
      i += 1;
      continue;
    }
    if (arg.startsWith("--proxy-log-level=")) {
      out.proxyLogLevel = arg.slice("--proxy-log-level=".length);
      continue;
    }
    if (arg === "--proxy-timeout-ms") {
      const v = Number(takeValue(arg, argv[i + 1]));
      i += 1;
      if (!Number.isFinite(v) || v < 0) throw new Error(`Invalid --proxy-timeout-ms: ${argv[i]}`);
      out.proxyReadyTimeoutMs = Math.floor(v);
      continue;
    }
    if (arg.startsWith("--proxy-timeout-ms=")) {
      const v = Number(arg.slice("--proxy-timeout-ms=".length));
      if (!Number.isFinite(v) || v < 0) throw new Error(`Invalid --proxy-timeout-ms: ${v}`);
      out.proxyReadyTimeoutMs = Math.floor(v);
      continue;
    }
    if (arg === "--proxy-no-fallback") {
      out.proxyFallback = false;
      continue;
    }
    if (arg === "--skip-onchain-check") {
      out.skipOnchainCheck = true;
      continue;
    }
    if (arg === "--fail-fast") {
      out.failFast = true;
      continue;
    }
    if (arg === "--whitelist") {
      out.whitelistPath = takeValue(arg, argv[i + 1]);
      i += 1;
      continue;
    }
    if (arg.startsWith("--whitelist=")) {
      out.whitelistPath = arg.slice("--whitelist=".length);
      continue;
    }
    if (arg === "--chain-id") {
      const v = Number(takeValue(arg, argv[i + 1]));
      i += 1;
      if (!Number.isFinite(v) || v <= 0) throw new Error(`Invalid --chain-id: ${v}`);
      out.chainId = Math.floor(v);
      continue;
    }
    if (arg.startsWith("--chain-id=")) {
      const v = Number(arg.slice("--chain-id=".length));
      if (!Number.isFinite(v) || v <= 0) throw new Error(`Invalid --chain-id: ${v}`);
      out.chainId = Math.floor(v);
      continue;
    }
    if (arg === "--beneficiary") {
      out.beneficiary = takeValue(arg, argv[i + 1]);
      i += 1;
      continue;
    }
    if (arg.startsWith("--beneficiary=")) {
      out.beneficiary = arg.slice("--beneficiary=".length);
      continue;
    }
    if (arg === "--beneficiary-user-id") {
      const v = Number(takeValue(arg, argv[i + 1]));
      i += 1;
      if (!Number.isFinite(v) || v <= 0) throw new Error(`Invalid --beneficiary-user-id: ${v}`);
      out.beneficiaryUserId = Math.floor(v);
      continue;
    }
    if (arg.startsWith("--beneficiary-user-id=")) {
      const v = Number(arg.slice("--beneficiary-user-id=".length));
      if (!Number.isFinite(v) || v <= 0) throw new Error(`Invalid --beneficiary-user-id: ${v}`);
      out.beneficiaryUserId = Math.floor(v);
      continue;
    }
    if (arg === "--count") {
      const v = Number(takeValue(arg, argv[i + 1]));
      i += 1;
      if (!Number.isFinite(v) || v <= 0) throw new Error(`Invalid --count: ${v}`);
      out.count = Math.floor(v);
      continue;
    }
    if (arg.startsWith("--count=")) {
      const v = Number(arg.slice("--count=".length));
      if (!Number.isFinite(v) || v <= 0) throw new Error(`Invalid --count: ${v}`);
      out.count = Math.floor(v);
      continue;
    }
    if (arg === "--limit") {
      const v = Number(takeValue(arg, argv[i + 1]));
      i += 1;
      if (!Number.isFinite(v) || v < 0) throw new Error(`Invalid --limit: ${v}`);
      out.limit = Math.floor(v);
      continue;
    }
    if (arg.startsWith("--limit=")) {
      const v = Number(arg.slice("--limit=".length));
      if (!Number.isFinite(v) || v < 0) throw new Error(`Invalid --limit: ${v}`);
      out.limit = Math.floor(v);
      continue;
    }
    if (arg === "--offset") {
      const v = Number(takeValue(arg, argv[i + 1]));
      i += 1;
      if (!Number.isFinite(v) || v < 0) throw new Error(`Invalid --offset: ${v}`);
      out.offset = Math.floor(v);
      continue;
    }
    if (arg.startsWith("--offset=")) {
      const v = Number(arg.slice("--offset=".length));
      if (!Number.isFinite(v) || v < 0) throw new Error(`Invalid --offset: ${v}`);
      out.offset = Math.floor(v);
      continue;
    }
    if (arg === "--permit-offset") {
      const v = Number(takeValue(arg, argv[i + 1]));
      i += 1;
      if (!Number.isFinite(v) || v < 0) throw new Error(`Invalid --permit-offset: ${v}`);
      out.permitOffset = Math.floor(v);
      continue;
    }
    if (arg.startsWith("--permit-offset=")) {
      const v = Number(arg.slice("--permit-offset=".length));
      if (!Number.isFinite(v) || v < 0) throw new Error(`Invalid --permit-offset: ${v}`);
      out.permitOffset = Math.floor(v);
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

const stringifyJson = (value: unknown, pretty: boolean) =>
  JSON.stringify(value, (_key, v) => (typeof v === "bigint" ? v.toString() : v), pretty ? 2 : undefined);

const slugify = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "rpc";

async function runCommand(
  args: string[],
  cwd: string,
  env: Record<string, string | undefined>
): Promise<{
  ok: boolean;
  code: number;
  stdout: string;
  stderr: string;
}> {
  const baseEnv = Deno.env.toObject();
  const mergedEnv = { ...baseEnv, ...env };
  const command = new Deno.Command(Deno.execPath(), {
    args,
    cwd,
    env: Object.fromEntries(Object.entries(mergedEnv).filter(([, v]) => v !== undefined)),
    stdout: "piped",
    stderr: "piped",
  });
  const result = await command.output();
  return {
    ok: result.code === 0,
    code: result.code,
    stdout: new TextDecoder().decode(result.stdout),
    stderr: new TextDecoder().decode(result.stderr),
  };
}

async function readJsonFile(path: string): Promise<unknown> {
  const text = await Deno.readTextFile(path);
  return JSON.parse(text);
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const normalizeBaseUrl = (value: string): string => value.replace(/\/$/, "");

async function waitForProxyReady(baseUrl: string, timeoutMs: number): Promise<void> {
  const healthUrl = `${normalizeBaseUrl(baseUrl)}/health`;
  const deadline = Date.now() + timeoutMs;
  let lastError = "";

  while (Date.now() < deadline) {
    try {
      const res = await fetch(healthUrl);
      if (res.ok) return;
      lastError = `HTTP ${res.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await sleep(500);
  }

  throw new Error(`Proxy not ready at ${healthUrl} after ${timeoutMs}ms${lastError ? ` (last error: ${lastError})` : ""}`);
}

async function startProxyServer({
  proxyRoot,
  proxyPort,
  proxyLogLevel,
  readyTimeoutMs,
}: {
  proxyRoot: string;
  proxyPort: number;
  proxyLogLevel: string;
  readyTimeoutMs: number;
}): Promise<{ process: Deno.ChildProcess; baseUrl: string }> {
  const serverDir = `${proxyRoot.replace(/\/$/, "")}/packages/permit2-rpc-server`;
  const baseUrl = `http://127.0.0.1:${proxyPort}`;
  const env = {
    ...Deno.env.toObject(),
    PORT: String(proxyPort),
    RPC_LOG_LEVEL: proxyLogLevel,
  };

  const command = new Deno.Command(Deno.execPath(), {
    args: ["task", "start"],
    cwd: serverDir,
    env: Object.fromEntries(Object.entries(env).filter(([, v]) => v !== undefined)),
    stdout: "inherit",
    stderr: "inherit",
  });

  const process = command.spawn();
  await waitForProxyReady(baseUrl, readyTimeoutMs);
  return { process, baseUrl };
}

type EligiblePermit = {
  id: number;
  deadline: number;
  permit2Address: `0x${string}`;
  owner: `0x${string}`;
  wordPos: bigint;
  bitPos: bigint;
};

async function loadEligiblePermitIds({
  beneficiary,
  chainId,
  skipOnchainCheck,
}: {
  beneficiary: string;
  chainId: number;
  skipOnchainCheck: boolean;
}): Promise<EligiblePermit[]> {
  const { client: supabase } = createSupabaseClientFromEnv();
  const rows = await fetchPermitsFromDb({
    supabaseClient: supabase,
    walletAddress: beneficiary,
    lastCheckTimestamp: null,
  });

  const nowSeconds = Math.floor(Date.now() / 1000);
  const lowerCaseWalletAddress = beneficiary.toLowerCase();
  const eligible: EligiblePermit[] = [];
  const refs = new Map<string, NonceBitmapRef>();

  for (let i = 0; i < rows.length; i += 1) {
    const permit = rows[i] as PermitRow;
    const { permitData } = await mapDbPermitToPermitDataWithIssues({ permit, lowerCaseWalletAddress });
    if (!permitData) continue;
    if (permitData.networkId !== chainId) continue;
    const deadline = Number(permitData.deadline);
    if (!Number.isFinite(deadline) || deadline <= nowSeconds) continue;
    const idValue = Number(permit.id);
    if (!Number.isFinite(idValue) || idValue <= 0) continue;
    const owner = normalizeHexAddress(permitData.owner);
    const permit2Address = permitData.permit2Address;
    const nonce = BigInt(permitData.nonce);
    const { wordPos, bitPos } = noncePositions(nonce);
    const refKey = bitmapKey({ chainId, permit2Address, owner, wordPos });
    refs.set(refKey, { chainId, permit2Address, owner, wordPos });
    eligible.push({ id: Math.floor(idValue), deadline, permit2Address, owner, wordPos, bitPos });
  }

  if (skipOnchainCheck) {
    eligible.sort((a, b) => b.id - a.id);
    return eligible;
  }

  const rpcBaseUrl = getRpcBaseUrlFromEnv();
  const nonceBitmaps = await fetchNonceBitmaps({ rpcBaseUrl, refs: [...refs.values()] });
  const filtered: EligiblePermit[] = [];
  let missingNonceBitmap = 0;
  let usedNonce = 0;

  for (const entry of eligible) {
    const key = bitmapKey({
      chainId,
      permit2Address: entry.permit2Address,
      owner: entry.owner,
      wordPos: entry.wordPos,
    });
    const result = nonceBitmaps.get(key);
    if (!result || "error" in result) {
      missingNonceBitmap += 1;
      continue;
    }
    if (isNonceUsed({ bitmap: result.bitmap, bitPos: entry.bitPos })) {
      usedNonce += 1;
      continue;
    }
    filtered.push(entry);
  }

  if (missingNonceBitmap > 0 || usedNonce > 0) {
    console.log(`Eligible permits filtered: ${filtered.length} kept, ${usedNonce} used, ${missingNonceBitmap} missing nonceBitmap.`);
  }

  filtered.sort((a, b) => b.id - a.id);
  return filtered;
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

  if (!args.whitelistPath) {
    console.error("Missing --whitelist");
    printUsage();
    Deno.exit(1);
    return;
  }

  if (!args.beneficiary) {
    console.error("Missing --beneficiary");
    printUsage();
    Deno.exit(1);
    return;
  }

  if (!isHexAddress(args.beneficiary)) {
    console.error("Invalid --beneficiary (expected 0x + 40 hex chars).");
    Deno.exit(1);
    return;
  }

  const beneficiary = normalizeHexAddress(args.beneficiary);

  if (args.useExisting) {
    args.seed = false;
  }

  if (!args.seed && !args.claim) {
    console.error("At least one of --seed or --claim must be enabled.");
    Deno.exit(1);
    return;
  }

  if (args.claim && !args.seed && !args.useExisting) {
    console.error("Claim step requires seeding unless --use-existing is set.");
    Deno.exit(1);
    return;
  }

  if (args.startProxy && !args.proxyRoot) {
    console.error("Missing --proxy-root (required when --start-proxy is set).");
    Deno.exit(1);
    return;
  }

  if (args.startProxy && args.proxyUrl) {
    console.error("--proxy-url cannot be used with --start-proxy (use --proxy-port instead).");
    Deno.exit(1);
    return;
  }

  const normalizedProxyLogLevel = args.proxyLogLevel.trim().toLowerCase();
  if (!["debug", "info", "warn", "error", "none"].includes(normalizedProxyLogLevel)) {
    console.error("Invalid --proxy-log-level (expected debug|info|warn|error|none).");
    Deno.exit(1);
    return;
  }
  args.proxyLogLevel = normalizedProxyLogLevel;

  const whitelist = await readJsonFile(args.whitelistPath);
  const rpcList = (whitelist as { rpcs?: Record<string, string[]> }).rpcs?.[String(args.chainId)] ?? [];
  let rpcUrls = rpcList.filter((url) => typeof url === "string" && /^https?:\/\//.test(url) && !url.includes("${"));

  rpcUrls = Array.from(new Set(rpcUrls));
  if (args.offset > 0) rpcUrls = rpcUrls.slice(args.offset);
  if (args.limit > 0) rpcUrls = rpcUrls.slice(0, args.limit);

  if (rpcUrls.length === 0) {
    console.error("No RPC URLs found for the requested chain.");
    Deno.exit(1);
    return;
  }

  let eligiblePermits: EligiblePermit[] = [];
  if (args.useExisting) {
    eligiblePermits = await loadEligiblePermitIds({
      beneficiary,
      chainId: args.chainId,
      skipOnchainCheck: args.skipOnchainCheck,
    });
    if (args.permitOffset > 0) {
      eligiblePermits = eligiblePermits.slice(args.permitOffset);
    }
    const requiredPermits = rpcUrls.length * args.count;
    if (eligiblePermits.length < requiredPermits) {
      console.error(
        `Not enough eligible permits. Needed ${requiredPermits} for ${rpcUrls.length} RPCs (count=${args.count}), found ${eligiblePermits.length}.`
      );
      Deno.exit(1);
      return;
    }
  }

  const repoRoot = new URL("..", import.meta.url).pathname;
  const outputDir = await Deno.makeTempDir({ prefix: "permit2-provider-e2e-" });

  const results: ProviderResult[] = [];
  const permitQueue = eligiblePermits.map((entry) => entry.id);

  let proxyProcess: Deno.ChildProcess | null = null;
  let proxyBaseUrl = args.proxyUrl ? normalizeBaseUrl(args.proxyUrl) : undefined;

  try {
    if (args.startProxy) {
      const started = await startProxyServer({
        proxyRoot: args.proxyRoot ?? "",
        proxyPort: args.proxyPort,
        proxyLogLevel: args.proxyLogLevel,
        readyTimeoutMs: args.proxyReadyTimeoutMs,
      });
      proxyProcess = started.process;
      proxyBaseUrl = normalizeBaseUrl(started.baseUrl);
    }

    const proxyRpcUrl = proxyBaseUrl ? `${proxyBaseUrl}/${args.chainId}` : null;
    if (proxyRpcUrl) {
      console.log(`Routing claim requests through proxy ${proxyRpcUrl}`);
    }

    for (let index = 0; index < rpcUrls.length; index += 1) {
      const rpcUrl = rpcUrls[index];
      const start = performance.now();
      const providerDir = `${outputDir}/${String(index + 1).padStart(3, "0")}-${slugify(rpcUrl)}`;
      await Deno.mkdir(providerDir, { recursive: true });

      console.log(`[${index + 1}/${rpcUrls.length}] Testing ${rpcUrl}`);
      const result: ProviderResult = { rpcUrl, elapsedMs: 0 };

      let permitIds: number[] | undefined;

      if (args.useExisting) {
        permitIds = permitQueue.splice(0, args.count);
        result.seed = {
          ok: permitIds.length === args.count,
          outputPath: undefined,
          permitIds,
          error: permitIds.length === args.count ? undefined : "Insufficient permits for this provider.",
        };
      } else if (args.seed) {
        const seedOut = `${providerDir}/seed.json`;
        const seedLog = `${providerDir}/seed.log`;
        const seedArgs = [
          "run",
          "-A",
          "scripts/permit2-seed-test-permits.ts",
          "--beneficiary",
          beneficiary,
          "--count",
          String(args.count),
          "--chain-id",
          String(args.chainId),
          "--execute",
          "--node-url",
          rpcUrl,
          "--out",
          seedOut,
        ];

        if (args.beneficiaryUserId) {
          seedArgs.push("--beneficiary-user-id", String(args.beneficiaryUserId));
        }
        if (args.pretty) seedArgs.push("--pretty");
        if (args.skipOnchainCheck) seedArgs.push("--skip-onchain-check");

        const seedRun = await runCommand(seedArgs, repoRoot, {});
        await Deno.writeTextFile(seedLog, `${seedRun.stdout}\n${seedRun.stderr}`);
        if (!seedRun.ok) {
          result.seed = { ok: false, outputPath: seedOut, error: seedRun.stderr.trim() || seedRun.stdout.trim() };
          results.push(result);
          if (args.failFast) break;
          continue;
        }

        const seedJson = await readJsonFile(seedOut);
        const seedReport = seedJson as SeedReport;
        permitIds = (seedReport.permits ?? []).map((entry) => entry.id).filter((id): id is number => typeof id === "number" && Number.isFinite(id));

        const seedOk = permitIds.length > 0;
        result.seed = {
          ok: seedOk,
          outputPath: seedOut,
          permitIds,
          error: seedOk ? undefined : "No permits returned from seed step.",
        };

        if (!seedOk) {
          results.push(result);
          if (args.failFast) break;
          continue;
        }
      }

      if (args.claim) {
        const claimOut = `${providerDir}/claim.json`;
        const claimLog = `${providerDir}/claim.log`;
        const claimArgs = [
          "run",
          "-A",
          "scripts/permit2-claim-test-permits.ts",
          "--beneficiary",
          beneficiary,
          "--chain-id",
          String(args.chainId),
          "--rpc-url",
          proxyRpcUrl ?? rpcUrl,
          "--private-key-env",
          args.claimPrivateKeyEnv,
          "--out",
          claimOut,
        ];

        if (proxyRpcUrl) {
          claimArgs.push("--rpc-header", `${PROXY_OVERRIDE_HEADER}: ${rpcUrl}`);
          if (args.proxyFallback) {
            claimArgs.push("--rpc-header", `${PROXY_FALLBACK_HEADER}: true`);
          }
        }

        if (permitIds && permitIds.length > 0) {
          claimArgs.push("--permit-ids", permitIds.join(","));
        }
        if (args.batch) claimArgs.push("--batch");
        if (args.execute) claimArgs.push("--execute");
        if (args.noWait) claimArgs.push("--no-wait");
        if (!args.noWait && args.waitTimeoutMs > 0) {
          claimArgs.push("--wait-timeout-ms", String(args.waitTimeoutMs));
        }
        if (!args.recordTransaction) {
          claimArgs.push("--no-record-transaction");
        }
        if (args.pretty) claimArgs.push("--pretty");

        const claimRun = await runCommand(claimArgs, repoRoot, {});
        await Deno.writeTextFile(claimLog, `${claimRun.stdout}\n${claimRun.stderr}`);
        if (!claimRun.ok) {
          result.claim = { ok: false, outputPath: claimOut, error: claimRun.stderr.trim() || claimRun.stdout.trim() };
          results.push(result);
          if (args.failFast) break;
          continue;
        }

        const claimJson = await readJsonFile(claimOut);
        const claimReport = claimJson as ClaimReport;
        const transactions = claimReport.transactions ?? [];
        const claimOk = transactions.length > 0;
        const warnings: string[] = [];
        const receiptTimeouts = transactions.filter((tx) => tx.receiptStatus === "timeout").length;
        const receiptReverts = transactions.filter((tx) => tx.receiptStatus === "reverted").length;
        const recordFailures = transactions.filter((tx) => tx.recordStatus === "failed").length;
        if (receiptTimeouts > 0) warnings.push(`receiptTimeouts=${receiptTimeouts}`);
        if (receiptReverts > 0) warnings.push(`receiptReverts=${receiptReverts}`);
        if (recordFailures > 0) warnings.push(`recordFailures=${recordFailures}`);
        result.claim = {
          ok: claimOk,
          outputPath: claimOut,
          error: claimOk ? undefined : "No transactions returned from claim step.",
          warnings: warnings.length > 0 ? warnings : undefined,
        };
      }

      result.elapsedMs = Math.round(performance.now() - start);
      results.push(result);
    }
  } finally {
    if (proxyProcess) {
      try {
        proxyProcess.kill("SIGTERM");
      } catch {
        // ignore
      }
      try {
        await proxyProcess.status;
      } catch {
        // ignore
      }
    }
  }

  const summary = {
    generatedAt: new Date().toISOString(),
    chainId: args.chainId,
    whitelistPath: args.whitelistPath,
    totalRpcs: rpcUrls.length,
    testedRpcs: results.length,
    seedEnabled: args.seed,
    claimEnabled: args.claim,
    useExisting: args.useExisting,
    permitOffset: args.permitOffset,
    claimPrivateKeyEnv: args.claimPrivateKeyEnv,
    execute: args.execute,
    waitTimeoutMs: args.waitTimeoutMs,
    recordTransaction: args.recordTransaction,
    proxyUrl: proxyBaseUrl ?? null,
    proxyStarted: args.startProxy,
    proxyPort: args.proxyPort,
    proxyLogLevel: args.proxyLogLevel,
    proxyFallback: args.proxyFallback,
    proxyReadyTimeoutMs: args.proxyReadyTimeoutMs,
    outputDir,
    results,
  };

  const outJson = stringifyJson(summary, args.pretty);
  if (args.out) {
    await Deno.writeTextFile(args.out, outJson);
    console.log(`Summary saved to ${args.out}`);
  } else {
    console.log(outJson);
  }
};

await main();
