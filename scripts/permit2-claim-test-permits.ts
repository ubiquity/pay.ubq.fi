#!/usr/bin/env -S deno run -A --ext=ts --env-file=.env

import type { SupabaseClient } from "@supabase/supabase-js";
import { createPublicClient, createWalletClient, encodeFunctionData, http } from "viem";
import type { Address, Chain } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import permit2Abi from "../src/fixtures/permit2-abi.ts";
import type { Database } from "../src/database.types.ts";
import type { PermitData } from "../src/types.ts";
import { fetchPermitsFromDb, mapDbPermitToPermitDataWithIssues } from "../src/workers/permit-checker.logic.ts";
import { createSupabaseClientFromEnv, getRpcBaseUrlFromEnv, isHexAddress, normalizeHexAddress } from "./permit2-tools.ts";

type CliArgs = {
  beneficiary?: string;
  since?: string;
  chainId?: number;
  permitIds: number[] | null;
  limit: number;
  batch: boolean;
  execute: boolean;
  waitForReceipt: boolean;
  waitTimeoutMs: number;
  recordTransaction: boolean;
  maxTxs: number;
  privateKeyEnv: string;
  rpcBaseUrl?: string;
  rpcUrl?: string;
  rpcHeaders: Record<string, string>;
  out?: string;
  pretty: boolean;
  help: boolean;
};

type MappedPermit = {
  id: number;
  created: string | null;
  permit: PermitData;
};

type TxReport = {
  mode: "single" | "batch";
  chainId: number;
  permit2Address: `0x${string}`;
  permitIds: number[];
  txHash?: `0x${string}`;
  rawSignedTransaction?: `0x${string}`;
  receiptStatus?: "success" | "reverted" | "timeout" | "skipped";
  recordStatus?: "recorded" | "skipped" | "failed";
  recordError?: string;
};

type SimulatedWriteRequest = {
  abi: readonly unknown[];
  address: Address;
  functionName: string;
  args: readonly unknown[];
  dataSuffix?: `0x${string}`;
  value?: bigint;
  gas?: bigint;
  gasPrice?: bigint;
  maxFeePerGas?: bigint;
  maxPriorityFeePerGas?: bigint;
  maxFeePerBlobGas?: bigint;
  nonce?: number;
  chain?: Chain;
};

type PrivateKeyAccount = ReturnType<typeof privateKeyToAccount>;

const printUsage = () => {
  console.error(
    `
Usage:
  BENEFICIARY_PRIVATE_KEY=0x... deno run -A --env-file=.env scripts/permit2-claim-test-permits.ts --beneficiary 0x... [options]

What it does:
  - Loads unclaimed permits for a beneficiary wallet from Supabase.
  - Builds Permit2 permitTransferFrom (or batchPermitTransferFrom) calls.
  - Signs the claim transactions, and optionally broadcasts them to the RPC provider.

Required:
  -b, --beneficiary         Wallet that will claim (spender = msg.sender).

Options:
  -s, --since               Only include permits created after this timestamp.
      --chain-id            Only include permits for a specific chain id.
      --permit-ids          Comma-separated permit ids to claim (overrides --limit).
      --limit               Max permits to claim (default: 10).
      --batch               Use batchPermitTransferFrom per (chainId, permit2Address).
      --execute             Broadcast transactions (default: false; sign-only).
      --no-wait             Do not wait for receipts after broadcast.
      --wait-timeout-ms     Receipt wait timeout in ms (default: 120000).
      --record-transaction  Record tx hash to Supabase after broadcast (default: true).
      --no-record-transaction  Skip recording tx hash to Supabase.
      --max-txs             Safety limit for broadcasts (default: 25).
      --private-key-env     Env var name holding the beneficiary private key (default: BENEFICIARY_PRIVATE_KEY).
      --rpc-base-url        Override RPC base URL (default: RPC_URL/VITE_RPC_URL or https://rpc.ubq.fi).
      --rpc-url             Override full RPC URL (no /<chainId> suffix; bypasses --rpc-base-url).
      --rpc-header          Add a custom RPC header (repeatable; format "Key: Value" or "Key=Value").
      --out                 Write JSON report to a file (otherwise prints to stdout).
  -p, --pretty              Pretty-print JSON.
  -h, --help                Show help.

Env:
  SUPABASE_URL or VITE_SUPABASE_URL
  SUPABASE_ANON_KEY or VITE_SUPABASE_ANON_KEY (fallback: SUPABASE_SERVICE_ROLE_KEY)
  RPC_URL or VITE_RPC_URL (optional, defaults to https://rpc.ubq.fi)

Signing env:
  BENEFICIARY_PRIVATE_KEY=0x... (or your chosen --private-key-env)
    `.trim()
  );
};

const parseArgs = (argv: string[]): CliArgs => {
  const out: CliArgs = {
    permitIds: null,
    limit: 10,
    batch: false,
    execute: false,
    waitForReceipt: true,
    waitTimeoutMs: 120000,
    recordTransaction: true,
    maxTxs: 25,
    privateKeyEnv: "BENEFICIARY_PRIVATE_KEY",
    rpcHeaders: {},
    pretty: false,
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
    if (arg === "--pretty" || arg === "-p") {
      out.pretty = true;
      continue;
    }
    if (arg === "--batch") {
      out.batch = true;
      continue;
    }
    if (arg === "--execute") {
      out.execute = true;
      continue;
    }
    if (arg === "--no-wait") {
      out.waitForReceipt = false;
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
    if (arg === "--beneficiary" || arg === "-b") {
      out.beneficiary = takeValue(arg, argv[i + 1]);
      i += 1;
      continue;
    }
    if (arg.startsWith("--beneficiary=")) {
      out.beneficiary = arg.slice("--beneficiary=".length);
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
    if (arg === "--chain-id") {
      const v = Number(takeValue(arg, argv[i + 1]));
      i += 1;
      if (!Number.isFinite(v) || v <= 0) throw new Error(`Invalid --chain-id: ${argv[i]}`);
      out.chainId = Math.floor(v);
      continue;
    }
    if (arg.startsWith("--chain-id=")) {
      const v = Number(arg.slice("--chain-id=".length));
      if (!Number.isFinite(v) || v <= 0) throw new Error(`Invalid --chain-id: ${v}`);
      out.chainId = Math.floor(v);
      continue;
    }
    if (arg === "--permit-ids") {
      const raw = takeValue(arg, argv[i + 1]);
      i += 1;
      out.permitIds = parsePermitIds(raw);
      continue;
    }
    if (arg.startsWith("--permit-ids=")) {
      out.permitIds = parsePermitIds(arg.slice("--permit-ids=".length));
      continue;
    }
    if (arg === "--limit") {
      const v = Number(takeValue(arg, argv[i + 1]));
      i += 1;
      if (!Number.isFinite(v) || v <= 0) throw new Error(`Invalid --limit: ${argv[i]}`);
      out.limit = Math.floor(v);
      continue;
    }
    if (arg.startsWith("--limit=")) {
      const v = Number(arg.slice("--limit=".length));
      if (!Number.isFinite(v) || v <= 0) throw new Error(`Invalid --limit: ${v}`);
      out.limit = Math.floor(v);
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
    if (arg === "--rpc-base-url") {
      out.rpcBaseUrl = takeValue(arg, argv[i + 1]);
      i += 1;
      continue;
    }
    if (arg.startsWith("--rpc-base-url=")) {
      out.rpcBaseUrl = arg.slice("--rpc-base-url=".length);
      continue;
    }
    if (arg === "--rpc-url") {
      out.rpcUrl = takeValue(arg, argv[i + 1]);
      i += 1;
      continue;
    }
    if (arg.startsWith("--rpc-url=")) {
      out.rpcUrl = arg.slice("--rpc-url=".length);
      continue;
    }
    if (arg === "--rpc-header") {
      const raw = takeValue(arg, argv[i + 1]);
      i += 1;
      const { key, value } = parseHeaderEntry(raw);
      out.rpcHeaders[key] = value;
      continue;
    }
    if (arg.startsWith("--rpc-header=")) {
      const raw = arg.slice("--rpc-header=".length);
      const { key, value } = parseHeaderEntry(raw);
      out.rpcHeaders[key] = value;
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

const parseHeaderEntry = (raw: string): { key: string; value: string } => {
  const trimmed = raw.trim();
  const colonIndex = trimmed.indexOf(":");
  const equalsIndex = trimmed.indexOf("=");
  let idx = -1;
  if (colonIndex >= 0 && (equalsIndex === -1 || colonIndex < equalsIndex)) {
    idx = colonIndex;
  } else if (equalsIndex >= 0) {
    idx = equalsIndex;
  }
  if (idx <= 0) throw new Error(`Invalid --rpc-header '${raw}' (expected Key: Value)`);
  const key = trimmed.slice(0, idx).trim();
  const value = trimmed.slice(idx + 1).trim();
  if (!key) throw new Error(`Invalid --rpc-header '${raw}' (missing key)`);
  return { key, value };
};

const parsePermitIds = (raw: string): number[] => {
  const ids = raw
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => Number(entry));

  if (ids.length === 0) throw new Error("Invalid --permit-ids (no ids provided)");
  if (ids.some((id) => !Number.isFinite(id) || id <= 0)) throw new Error(`Invalid --permit-ids: ${raw}`);
  return ids.map((id) => Math.floor(id));
};

const stringifyJson = (value: unknown, pretty: boolean) =>
  JSON.stringify(
    value,
    (_key, v) => {
      if (typeof v === "bigint") return v.toString();
      return v;
    },
    pretty ? 2 : undefined
  );

const isHexPrivateKey = (value: string) => /^0x[0-9a-fA-F]{64}$/.test(value.trim());
const normalizeTxHash = (value: string): `0x${string}` => {
  const trimmed = value.trim().toLowerCase();
  if (trimmed.startsWith("0x")) return trimmed as `0x${string}`;
  return `0x${trimmed}` as `0x${string}`;
};

const isReceiptTimeout = (error: unknown) =>
  error instanceof Error &&
  (error.name === "WaitForTransactionReceiptTimeoutError" || /timed out while waiting for transaction/i.test(error.message));

async function recordTransactionForPermits({
  supabase,
  permitIds,
  txHash,
}: {
  supabase: SupabaseClient<Database>;
  permitIds: number[];
  txHash: `0x${string}`;
}): Promise<{ ok: true; updated: number } | { ok: false; error: string }> {
  if (permitIds.length === 0) return { ok: true, updated: 0 };
  const normalizedHash = normalizeTxHash(txHash);
  const { data, error } = await supabase
    .from("permits")
    .update({ transaction: normalizedHash })
    .in("id", permitIds)
    .is("transaction", null)
    .select("id");
  if (error) return { ok: false, error: error.message };
  return { ok: true, updated: data?.length ?? 0 };
}

function getChain(chainId: number, rpcUrl: string): Chain {
  if (chainId === 1) {
    return { id: 1, name: "Mainnet", nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: [rpcUrl] } } } as Chain;
  }
  if (chainId === 100) {
    return { id: 100, name: "Gnosis", nativeCurrency: { name: "xDAI", symbol: "XDAI", decimals: 18 }, rpcUrls: { default: { http: [rpcUrl] } } } as Chain;
  }
  if (chainId === 8453) {
    return { id: 8453, name: "Base", nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: [rpcUrl] } } } as Chain;
  }
  if (chainId === 42161) {
    return { id: 42161, name: "Arbitrum", nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: [rpcUrl] } } } as Chain;
  }
  return {
    id: chainId,
    name: `Chain ${chainId}`,
    nativeCurrency: { name: "Native", symbol: "NATIVE", decimals: 18 },
    rpcUrls: { default: { http: [rpcUrl] } },
  } as Chain;
}

async function prepareAndSignTransaction({
  publicClient,
  walletClient,
  account,
  request,
}: {
  publicClient: ReturnType<typeof createPublicClient>;
  walletClient: ReturnType<typeof createWalletClient>;
  account: PrivateKeyAccount;
  request: SimulatedWriteRequest;
}): Promise<{ rawSignedTransaction: `0x${string}` }> {
  const calldata = encodeFunctionData({
    abi: request.abi,
    functionName: request.functionName,
    args: request.args,
  });
  const data = request.dataSuffix ? (`${calldata}${request.dataSuffix.replace(/^0x/, "")}` as `0x${string}`) : calldata;
  const prepared = await publicClient.prepareTransactionRequest({
    account: account.address,
    chain: request.chain ?? publicClient.chain,
    to: request.address,
    data,
    value: request.value,
    gas: request.gas,
    gasPrice: request.gasPrice,
    maxFeePerGas: request.maxFeePerGas,
    maxPriorityFeePerGas: request.maxPriorityFeePerGas,
    maxFeePerBlobGas: request.maxFeePerBlobGas,
    nonce: request.nonce,
  });

  const rawSignedTransaction = await walletClient.signTransaction({
    to: prepared.to,
    data: prepared.data,
    value: prepared.value,
    gas: prepared.gas,
    nonce: prepared.nonce,
    gasPrice: prepared.gasPrice,
    maxFeePerGas: prepared.maxFeePerGas,
    maxPriorityFeePerGas: prepared.maxPriorityFeePerGas,
    maxFeePerBlobGas: prepared.maxFeePerBlobGas,
    accessList: prepared.accessList,
    blobVersionedHashes: prepared.blobVersionedHashes,
    authorizationList: prepared.authorizationList,
    chainId: prepared.chainId,
    type: prepared.type,
    chain: prepared.chain,
    account,
  });

  return { rawSignedTransaction };
}

async function loadPermits({
  supabase,
  beneficiary,
  since,
}: {
  supabase: SupabaseClient;
  beneficiary: string;
  since?: string;
}): Promise<{ permits: MappedPermit[]; skipped: { id: number; reason: string }[] }> {
  const rows = await fetchPermitsFromDb({
    supabaseClient: supabase,
    walletAddress: beneficiary,
    lastCheckTimestamp: since ?? null,
  });

  const lowerCaseWalletAddress = beneficiary.toLowerCase();
  const permits: MappedPermit[] = [];
  const skipped: { id: number; reason: string }[] = [];

  for (const row of rows) {
    const { permitData, issues } = await mapDbPermitToPermitDataWithIssues({ permit: row, lowerCaseWalletAddress });
    if (!permitData) {
      skipped.push({ id: row.id, reason: issues.length ? issues.join(",") : "unknown" });
      continue;
    }

    permits.push({ id: row.id, created: row.created ?? null, permit: permitData });
  }

  return { permits, skipped };
}

function filterAndSortPermits({
  permits,
  permitIds,
  chainId,
  limit,
}: {
  permits: MappedPermit[];
  permitIds: number[] | null;
  chainId?: number;
  limit: number;
}): { selected: MappedPermit[]; skipped: { id: number; reason: string }[] } {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const skipped: { id: number; reason: string }[] = [];

  const idSet = permitIds ? new Set(permitIds) : null;
  const idOrder = permitIds ? new Map(permitIds.map((id, index) => [id, index])) : null;

  const filtered = permits.filter((entry) => {
    if (idSet && !idSet.has(entry.id)) {
      skipped.push({ id: entry.id, reason: "not_selected" });
      return false;
    }
    if (chainId && entry.permit.networkId !== chainId) {
      skipped.push({ id: entry.id, reason: `chain_id_mismatch:${entry.permit.networkId}` });
      return false;
    }
    const deadline = Number(entry.permit.deadline);
    if (!Number.isFinite(deadline) || deadline <= nowSeconds) {
      skipped.push({ id: entry.id, reason: "expired" });
      return false;
    }
    return true;
  });

  if (idOrder) {
    filtered.sort((a, b) => (idOrder.get(a.id) ?? 0) - (idOrder.get(b.id) ?? 0));
    return { selected: filtered, skipped };
  }

  filtered.sort((a, b) => b.id - a.id);
  return { selected: filtered.slice(0, limit), skipped };
}

function groupPermitsForBatch(permits: MappedPermit[]): Map<string, MappedPermit[]> {
  const groups = new Map<string, MappedPermit[]>();
  for (const entry of permits) {
    const key = `${entry.permit.networkId}:${entry.permit.permit2Address.toLowerCase()}`;
    const group = groups.get(key);
    if (group) {
      group.push(entry);
    } else {
      groups.set(key, [entry]);
    }
  }
  return groups;
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

  if (!args.beneficiary) {
    console.error("Missing --beneficiary");
    console.error("");
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

  const privateKeyRaw = Deno.env.get(args.privateKeyEnv)?.trim();
  if (!privateKeyRaw || !isHexPrivateKey(privateKeyRaw)) {
    console.error(`Missing/invalid private key in env var ${args.privateKeyEnv} (expected 0x + 64 hex chars).`);
    Deno.exit(1);
    return;
  }

  const account = privateKeyToAccount(privateKeyRaw);
  if (account.address.toLowerCase() !== beneficiary.toLowerCase()) {
    console.error(`Private key address ${account.address} does not match --beneficiary ${beneficiary}.`);
    Deno.exit(1);
    return;
  }

  const { client: supabase } = createSupabaseClientFromEnv();
  const { permits, skipped: mappingSkipped } = await loadPermits({
    supabase,
    beneficiary,
    since: args.since,
  });

  const { selected, skipped: filterSkipped } = filterAndSortPermits({
    permits,
    permitIds: args.permitIds,
    chainId: args.chainId,
    limit: args.limit,
  });

  if (selected.length === 0) {
    const report = {
      generatedAt: new Date().toISOString(),
      beneficiary,
      selectedPermitCount: 0,
      txCount: 0,
      skipped: [...mappingSkipped, ...filterSkipped],
    };
    const out = stringifyJson(report, args.pretty);
    if (args.out) await Deno.writeTextFile(args.out, out);
    else console.log(out);
    return;
  }

  const rpcBaseUrl = (args.rpcBaseUrl ?? getRpcBaseUrlFromEnv()).replace(/\/$/, "");
  const rpcUrlOverride = args.rpcUrl ? args.rpcUrl.replace(/\/$/, "") : null;
  if (rpcUrlOverride) {
    const chainIds = new Set(selected.map((entry) => entry.permit.networkId));
    if (chainIds.size > 1) {
      throw new Error("Cannot use --rpc-url when permits span multiple chainIds.");
    }
  }

  const clientByChain = new Map<number, { publicClient: ReturnType<typeof createPublicClient>; walletClient: ReturnType<typeof createWalletClient> }>();
  for (const entry of selected) {
    if (clientByChain.has(entry.permit.networkId)) continue;
    const rpcUrl = rpcUrlOverride ?? `${rpcBaseUrl}/${entry.permit.networkId}`;
    const chain = getChain(entry.permit.networkId, rpcUrl);
    const transport = http(rpcUrl, { headers: args.rpcHeaders });
    clientByChain.set(entry.permit.networkId, {
      publicClient: createPublicClient({ chain, transport }),
      walletClient: createWalletClient({ chain, transport, account }),
    });
  }

  const txReports: TxReport[] = [];
  const shouldRecord = args.execute && args.recordTransaction;
  const permitSummaries = selected.map((entry) => ({
    id: entry.id,
    networkId: entry.permit.networkId,
    permit2Address: entry.permit.permit2Address,
    tokenAddress: entry.permit.tokenAddress,
    amount: entry.permit.amount.toString(),
    nonce: entry.permit.nonce,
    deadline: entry.permit.deadline,
  }));

  const batchGroups = args.batch ? groupPermitsForBatch(selected) : null;
  const plannedTxCount = args.batch ? batchGroups?.size ?? 0 : selected.length;
  if (args.execute && plannedTxCount > args.maxTxs) {
    throw new Error(`Refusing to execute ${plannedTxCount} txs (exceeds --max-txs ${args.maxTxs}).`);
  }

  if (args.batch && batchGroups) {
    for (const group of batchGroups.values()) {
      const first = group[0];
      const clients = clientByChain.get(first.permit.networkId);
      if (!clients) throw new Error(`Missing client for chain ${first.permit.networkId}`);

      const permit2Address = first.permit.permit2Address;
      const permitsPayload = group.map((entry) => ({
        permitted: {
          token: entry.permit.tokenAddress as `0x${string}`,
          amount: entry.permit.amount,
        },
        nonce: BigInt(entry.permit.nonce),
        deadline: BigInt(entry.permit.deadline),
      }));

      const transferDetails = group.map((entry) => ({
        to: beneficiary,
        requestedAmount: entry.permit.amount,
      }));

      const owners = group.map((entry) => entry.permit.owner as `0x${string}`);
      const signatures = group.map((entry) => entry.permit.signature as `0x${string}`);

      const { request } = await clients.publicClient.simulateContract({
        address: permit2Address,
        abi: permit2Abi,
        functionName: "batchPermitTransferFrom",
        args: [permitsPayload, transferDetails, owners, signatures],
        account,
      });

      if (args.execute) {
        const txHash = await clients.walletClient.writeContract({ ...request, account });
        let receiptStatus: TxReport["receiptStatus"] = args.waitForReceipt ? "success" : "skipped";
        if (args.waitForReceipt) {
          try {
            const waitArgs = args.waitTimeoutMs > 0 ? { hash: txHash, timeout: args.waitTimeoutMs } : { hash: txHash };
            const receipt = await clients.publicClient.waitForTransactionReceipt(waitArgs);
            if (receipt.status !== "success") {
              receiptStatus = "reverted";
              throw new Error(`Batch claim failed: ${txHash}`);
            }
          } catch (error) {
            if (isReceiptTimeout(error)) {
              receiptStatus = "timeout";
            } else {
              throw error;
            }
          }
        }
        let recordStatus: TxReport["recordStatus"] | undefined;
        let recordError: string | undefined;
        if (shouldRecord) {
          const recordResult = await recordTransactionForPermits({
            supabase,
            permitIds: group.map((entry) => entry.id),
            txHash,
          });
          recordStatus = recordResult.ok ? "recorded" : "failed";
          recordError = recordResult.ok ? undefined : recordResult.error;
          if (!recordResult.ok) {
            console.warn("Failed to record batch claim tx", { txHash, error: recordResult.error });
          }
        } else {
          recordStatus = "skipped";
        }
        txReports.push({
          mode: "batch",
          chainId: first.permit.networkId,
          permit2Address,
          permitIds: group.map((entry) => entry.id),
          txHash,
          receiptStatus,
          recordStatus,
          recordError,
        });
      } else {
        const { rawSignedTransaction } = await prepareAndSignTransaction({
          publicClient: clients.publicClient,
          walletClient: clients.walletClient,
          account,
          request: request as SimulatedWriteRequest,
        });
        txReports.push({
          mode: "batch",
          chainId: first.permit.networkId,
          permit2Address,
          permitIds: group.map((entry) => entry.id),
          rawSignedTransaction,
        });
      }
    }
  } else {
    for (const entry of selected) {
      const clients = clientByChain.get(entry.permit.networkId);
      if (!clients) throw new Error(`Missing client for chain ${entry.permit.networkId}`);

      const { request } = await clients.publicClient.simulateContract({
        address: entry.permit.permit2Address,
        abi: permit2Abi,
        functionName: "permitTransferFrom",
        args: [
          {
            permitted: {
              token: entry.permit.tokenAddress as `0x${string}`,
              amount: entry.permit.amount,
            },
            nonce: BigInt(entry.permit.nonce),
            deadline: BigInt(entry.permit.deadline),
          },
          {
            to: beneficiary,
            requestedAmount: entry.permit.amount,
          },
          entry.permit.owner as `0x${string}`,
          entry.permit.signature as `0x${string}`,
        ],
        account,
      });

      if (args.execute) {
        const txHash = await clients.walletClient.writeContract({ ...request, account });
        let receiptStatus: TxReport["receiptStatus"] = args.waitForReceipt ? "success" : "skipped";
        if (args.waitForReceipt) {
          try {
            const waitArgs = args.waitTimeoutMs > 0 ? { hash: txHash, timeout: args.waitTimeoutMs } : { hash: txHash };
            const receipt = await clients.publicClient.waitForTransactionReceipt(waitArgs);
            if (receipt.status !== "success") {
              receiptStatus = "reverted";
              throw new Error(`Claim failed: ${txHash}`);
            }
          } catch (error) {
            if (isReceiptTimeout(error)) {
              receiptStatus = "timeout";
            } else {
              throw error;
            }
          }
        }
        let recordStatus: TxReport["recordStatus"] | undefined;
        let recordError: string | undefined;
        if (shouldRecord) {
          const recordResult = await recordTransactionForPermits({
            supabase,
            permitIds: [entry.id],
            txHash,
          });
          recordStatus = recordResult.ok ? "recorded" : "failed";
          recordError = recordResult.ok ? undefined : recordResult.error;
          if (!recordResult.ok) {
            console.warn("Failed to record claim tx", { txHash, error: recordResult.error });
          }
        } else {
          recordStatus = "skipped";
        }
        txReports.push({
          mode: "single",
          chainId: entry.permit.networkId,
          permit2Address: entry.permit.permit2Address,
          permitIds: [entry.id],
          txHash,
          receiptStatus,
          recordStatus,
          recordError,
        });
      } else {
        const { rawSignedTransaction } = await prepareAndSignTransaction({
          publicClient: clients.publicClient,
          walletClient: clients.walletClient,
          account,
          request: request as SimulatedWriteRequest,
        });
        txReports.push({
          mode: "single",
          chainId: entry.permit.networkId,
          permit2Address: entry.permit.permit2Address,
          permitIds: [entry.id],
          rawSignedTransaction,
        });
      }
    }
  }

  const report = {
    generatedAt: new Date().toISOString(),
    beneficiary,
    rpcBaseUrl: rpcUrlOverride ?? rpcBaseUrl,
    rpcUrl: rpcUrlOverride,
    rpcHeaders: args.rpcHeaders,
    execute: args.execute,
    batch: args.batch,
    waitForReceipt: args.waitForReceipt,
    waitTimeoutMs: args.waitTimeoutMs,
    recordTransaction: args.recordTransaction,
    limit: args.limit,
    chainId: args.chainId ?? null,
    selectedPermitCount: selected.length,
    txCount: txReports.length,
    permits: permitSummaries,
    transactions: txReports,
    skipped: [...mappingSkipped, ...filterSkipped],
  };

  const out = stringifyJson(report, args.pretty);
  if (args.out) await Deno.writeTextFile(args.out, out);
  else console.log(out);
};

await main();
