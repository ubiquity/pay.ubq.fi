#!/usr/bin/env -S deno run -A --env-file=.env

import { createClient } from "@supabase/supabase-js";
import { createRpcClient } from "@ubiquity-dao/permit2-rpc-client";
import type { Database } from "../src/database.types.ts";
import type { PermitData } from "../src/types.ts";
import {
  fetchPermitsFromDb,
  mapDbPermitToPermitData,
  mapDbPermitToPermitDataWithIssues,
  validatePermitsBatch,
  type Logger,
  type PermitMappingIssue,
} from "../src/workers/permit-checker.logic.ts";

type CliArgs = {
  address?: string;
  since?: string;
  rpc?: string;
  audit: boolean;
  pretty: boolean;
  help: boolean;
};

const printUsage = () => {
  console.error(
    `
Usage:
  deno run -A --env-file=.env scripts/permit-checker.ts --address 0x... [--since <timestamp>] [--rpc <baseUrl>] [--audit] [--pretty]

Options:
  -a, --address   Wallet address to check (0x + 40 hex chars). Also accepted as first positional arg.
  -s, --since     Optional timestamp (ISO or any Date.parse-able string) to only fetch permits created after it.
  -r, --rpc       RPC base URL (defaults to RPC_URL/VITE_RPC_URL env or https://rpc.ubq.fi).
      --audit     Include an audit report of DB rows that were skipped (missing partner/token/signature/etc).
  -p, --pretty    Pretty-print JSON output.
  -h, --help      Show this help.

Env (inherits existing project vars):
  SUPABASE_URL or VITE_SUPABASE_URL
  SUPABASE_ANON_KEY or VITE_SUPABASE_ANON_KEY (fallback: SUPABASE_SERVICE_ROLE_KEY)
  RPC_URL or VITE_RPC_URL (optional)
    `.trim()
  );
};

const parseArgs = (argv: string[]): CliArgs => {
  const out: CliArgs = { pretty: false, help: false, audit: false };
  const positionals: string[] = [];

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
    if (arg === "--audit") {
      out.audit = true;
      continue;
    }

    const takeValue = (flag: string) => {
      const next = argv[i + 1];
      if (!next || next.startsWith("-")) {
        throw new Error(`Missing value for ${flag}`);
      }
      i += 1;
      return next;
    };

    if (arg === "--address" || arg === "-a") {
      out.address = takeValue(arg);
      continue;
    }
    if (arg.startsWith("--address=")) {
      out.address = arg.slice("--address=".length);
      continue;
    }
    if (arg === "--since" || arg === "-s") {
      out.since = takeValue(arg);
      continue;
    }
    if (arg.startsWith("--since=")) {
      out.since = arg.slice("--since=".length);
      continue;
    }
    if (arg === "--rpc" || arg === "-r") {
      out.rpc = takeValue(arg);
      continue;
    }
    if (arg.startsWith("--rpc=")) {
      out.rpc = arg.slice("--rpc=".length);
      continue;
    }

    if (arg.startsWith("-")) {
      throw new Error(`Unknown option: ${arg}`);
    }
    positionals.push(arg);
  }

  if (!out.address && positionals.length > 0) {
    out.address = positionals[0];
  }

  return out;
};

const isHexAddress = (value: string) => /^0x[0-9a-fA-F]{40}$/.test(value.trim());

const getEnv = (key: string) => {
  try {
    return Deno.env.get(key) ?? undefined;
  } catch {
    return undefined;
  }
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

type AuditSkippedRow = {
  id: number;
  nonce: string;
  issues: PermitMappingIssue[];
  partner_id: number | null;
  token_id: number | null;
  beneficiary_id: number;
  signature: string;
  amount: string;
  deadline: string;
  created: string;
};

type PermitDataWithDbId = PermitData & { dbId: number };

const increment = (record: Record<string, number>, key: string) => {
  record[key] = (record[key] ?? 0) + 1;
};

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

  const rawAddress = args.address?.trim();
  if (!rawAddress || !isHexAddress(rawAddress)) {
    console.error("Missing/invalid --address (expected 0x + 40 hex chars).");
    console.error("");
    printUsage();
    Deno.exit(1);
    return;
  }

  const lowerCaseWalletAddress = rawAddress.toLowerCase();

  const supabaseUrl = getEnv("SUPABASE_URL") ?? getEnv("VITE_SUPABASE_URL");
  const anonKey = getEnv("SUPABASE_ANON_KEY") ?? getEnv("VITE_SUPABASE_ANON_KEY");
  const serviceRoleKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");
  const supabaseKey = anonKey ?? serviceRoleKey;

  if (!supabaseUrl || !supabaseKey) {
    console.error(
      "Missing Supabase env vars. Need SUPABASE_URL (or VITE_SUPABASE_URL) and SUPABASE_ANON_KEY/VITE_SUPABASE_ANON_KEY (or SUPABASE_SERVICE_ROLE_KEY)."
    );
    Deno.exit(1);
    return;
  }

  if (!anonKey && serviceRoleKey) {
    console.error("Note: using SUPABASE_SERVICE_ROLE_KEY (bypasses RLS); results may differ from browser worker behavior.");
  }

  const rpcBaseUrl = (args.rpc ?? getEnv("RPC_URL") ?? getEnv("VITE_RPC_URL") ?? "https://rpc.ubq.fi").replace(/\/$/, "");

  const logger: Logger = {
    log: (...values) => console.error(...values),
    warn: (...values) => console.error(...values),
    error: (...values) => console.error(...values),
  };

  const supabase = createClient<Database>(supabaseUrl, supabaseKey);
  const rpcClient = createRpcClient({ baseUrl: rpcBaseUrl });

  const permitsFromDb = await fetchPermitsFromDb({
    supabaseClient: supabase,
    walletAddress: lowerCaseWalletAddress,
    lastCheckTimestamp: args.since ?? null,
    logger,
  });

  if (args.audit) {
    const skipped: AuditSkippedRow[] = [];
    const issueCounts: Record<string, number> = {};
    const mappedPermits: PermitDataWithDbId[] = [];

    for (let index = 0; index < permitsFromDb.length; index += 1) {
      const permit = permitsFromDb[index];
      const mapped = await mapDbPermitToPermitDataWithIssues({ permit, lowerCaseWalletAddress });
      if (mapped.permitData) {
        mappedPermits.push({ ...mapped.permitData, dbId: permit.id });
        continue;
      }

      mapped.issues.forEach((issue) => increment(issueCounts, issue));
      skipped.push({
        id: permit.id,
        nonce: String(permit.nonce),
        issues: mapped.issues,
        partner_id: permit.partner_id ?? null,
        token_id: permit.token_id ?? null,
        beneficiary_id: permit.beneficiary_id,
        signature: String(permit.signature),
        amount: String(permit.amount),
        deadline: String(permit.deadline),
        created: String(permit.created),
      });
    }

    const validated = await validatePermitsBatch({ rpcClient, permitsToValidate: mappedPermits, logger });

    const statusCounts: Record<string, number> = {};
    let checkErrorCount = 0;
    let nonceUsedCount = 0;

    validated.permits.forEach((permit) => {
      increment(statusCounts, permit.status ?? "Unknown");
      if (permit.checkError) checkErrorCount += 1;
      if (permit.isNonceUsed) nonceUsedCount += 1;
    });

    const output = {
      walletAddress: lowerCaseWalletAddress,
      rpcBaseUrl,
      since: args.since ?? null,
      fetchedCount: permitsFromDb.length,
      mappedCount: mappedPermits.length,
      skippedCount: skipped.length,
      issueCounts,
      skipped,
      validation: {
        permitCount: validated.permits.length,
        statusCounts,
        checkErrorCount,
        nonceUsedCount,
      },
      permits: validated.permits,
      balancesAndAllowances: Array.from(validated.balancesAndAllowances.entries()),
    };

    console.log(stringifyJson(output, args.pretty));
    return;
  }

  const mappedPermits = (
    await Promise.all(permitsFromDb.map((permit, index) => mapDbPermitToPermitData({ permit, index, lowerCaseWalletAddress, logger })))
  ).filter((permit): permit is PermitData => permit !== null);

  const validated = await validatePermitsBatch({ rpcClient, permitsToValidate: mappedPermits, logger });

  const output = {
    walletAddress: lowerCaseWalletAddress,
    rpcBaseUrl,
    since: args.since ?? null,
    permitCount: validated.permits.length,
    permits: validated.permits,
    balancesAndAllowances: Array.from(validated.balancesAndAllowances.entries()),
  };

  console.log(stringifyJson(output, args.pretty));
};

await main();
