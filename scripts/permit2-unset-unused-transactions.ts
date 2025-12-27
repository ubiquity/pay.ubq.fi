#!/usr/bin/env -S deno run -A --ext=ts --env-file=.env

import { createSupabaseClientFromEnv } from "./permit2-tools.ts";

type CliArgs = {
  report: string;
  out: string;
  execute: boolean;
  maxUpdates: number;
  pretty: boolean;
  help: boolean;
};

const DEFAULT_REPORT = "reports/permit2-audit.json";
const DEFAULT_OUT = "reports/permit2-dbtx-nonce-unused-backup.json";

const printUsage = () => {
  console.error(
    `
Usage:
  deno run -A --env-file=.env scripts/permit2-unset-unused-transactions.ts [--report <file>] [--out <file>]
    [--execute] [--max-updates <n>] [--pretty]

What it does:
  - Reads a permit2 audit report.
  - Backs up anomalies.dbTransactionSetButNonceUnused.permits to JSON.
  - Optionally unsets permits.transaction for those rows (where tx matches).

Options:
  -r, --report   Audit report JSON path (default: ${DEFAULT_REPORT}).
  -o, --out      Backup JSON path (default: ${DEFAULT_OUT}).
      --execute  Actually write updates to Supabase (default: false).
      --max-updates  Safety limit for updates (default: 500).
  -p, --pretty   Pretty-print JSON output.
  -h, --help     Show help.
    `.trim()
  );
};

const parseArgs = (argv: string[]): CliArgs => {
  const out: CliArgs = {
    report: DEFAULT_REPORT,
    out: DEFAULT_OUT,
    execute: false,
    maxUpdates: 500,
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
    if (arg.startsWith("-")) throw new Error(`Unknown option: ${arg}`);
    throw new Error(`Unexpected positional arg: ${arg}`);
  }

  return out;
};

const stringifyJson = (value: unknown, pretty: boolean) => JSON.stringify(value, null, pretty ? 2 : undefined);

const normalizeTxHash = (value: string | null | undefined): `0x${string}` | null => {
  if (!value) return null;
  const trimmed = value.trim().toLowerCase();
  if (!/^0x[0-9a-f]{64}$/.test(trimmed)) return null;
  return trimmed as `0x${string}`;
};

const loadReportPermits = (raw: string) => {
  const parsed = JSON.parse(raw) as {
    anomalies?: { dbTransactionSetButNonceUnused?: { permits?: unknown[] } };
  };
  const permits = parsed.anomalies?.dbTransactionSetButNonceUnused?.permits;
  if (!Array.isArray(permits)) {
    throw new Error("Report missing anomalies.dbTransactionSetButNonceUnused.permits array.");
  }
  return permits as Array<Record<string, unknown>>;
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

  const reportRaw = await Deno.readTextFile(args.report);
  const reportPermits = loadReportPermits(reportRaw);

  const skipped: Array<{ id: number | null; reason: string }> = [];
  const selected: Array<{ id: number; transaction: `0x${string}` }> = [];

  for (const entry of reportPermits) {
    const id = typeof entry.id === "number" ? entry.id : null;
    const txRaw = typeof entry.dbTransaction === "string" ? entry.dbTransaction : null;
    const tx = normalizeTxHash(txRaw);
    if (!id) {
      skipped.push({ id, reason: "missing_id" });
      continue;
    }
    if (!tx) {
      skipped.push({ id, reason: "invalid_transaction" });
      continue;
    }
    selected.push({ id, transaction: tx });
  }

  const backup = {
    generatedAt: new Date().toISOString(),
    reportSource: args.report,
    count: reportPermits.length,
    selectedCount: selected.length,
    skippedCount: skipped.length,
    permits: reportPermits,
    selected,
    skipped,
  };

  await Deno.writeTextFile(args.out, stringifyJson(backup, args.pretty));
  console.error(`Wrote backup: ${args.out}`);

  if (!args.execute) {
    return;
  }

  const { client: supabase, usesServiceRole } = createSupabaseClientFromEnv({ preferServiceRole: true });
  if (!usesServiceRole) {
    throw new Error("Refusing to --execute without SUPABASE_SERVICE_ROLE_KEY (service role required to bypass RLS for updates).");
  }
  console.error("Note: using SUPABASE_SERVICE_ROLE_KEY (bypasses RLS); results may differ from browser worker behavior.");

  let updated = 0;
  const conflicts: Array<{ id: number; transaction: string }> = [];
  const capped = selected.slice(0, args.maxUpdates);

  for (const entry of capped) {
    const { data, error } = await supabase
      .from("permits")
      .update({ transaction: null })
      .eq("id", entry.id)
      .eq("transaction", entry.transaction)
      .select("id");
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) {
      conflicts.push({ id: entry.id, transaction: entry.transaction });
      continue;
    }
    updated += data.length;
  }

  const summary = {
    executed: true,
    requested: selected.length,
    capped: capped.length,
    updated,
    conflicts,
    skipped,
    maxUpdates: args.maxUpdates,
    backup: args.out,
  };

  console.log(stringifyJson(summary, args.pretty));
};

await main();
