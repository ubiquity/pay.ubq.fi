#!/usr/bin/env -S deno run -A --ext=ts --env-file=.env

import { createSupabaseClientFromEnv } from "./permit2-tools.ts";

type CliArgs = {
  execute: boolean;
  maxUpdates: number;
  out?: string;
  pretty: boolean;
  help: boolean;
};

type PermitRow = {
  id: number;
  created: string | null;
  partner_id: number | null;
  signature?: string | null;
  location?: { node_url?: string | null } | null;
};

type OrgDefault = {
  org: string;
  partnerId: number;
  sourcePermitId: number;
  sourceCreated: string | null;
  sourceRepo: string | null;
};

type ReportUpdate = {
  id: number;
  org: string;
  repo: string | null;
  nodeUrl: string | null;
  partnerId: number;
  sourcePermitId: number;
  sourceCreated: string | null;
};

type ReportSkip = {
  id: number;
  org: string | null;
  repo: string | null;
  nodeUrl: string | null;
  reason: string;
};

const printUsage = () => {
  console.error(
    `
Usage:
  deno run -A --env-file=.env scripts/permit2-backfill-partners-by-org.ts [--execute] [--max-updates <n>] [--out <file>] [--pretty]

What it does:
  - Determines the latest partner_id per org based on existing permits with partner_id.
  - Applies that partner_id to missing-partner permits for the same org.

Options:
      --execute      Write updates to Supabase (default: false; dry-run).
      --max-updates  Safety limit for number of permit rows to update (default: 500).
      --out          Write full report JSON to a file (otherwise prints summary only).
  -p, --pretty       Pretty-print JSON output.
  -h, --help         Show help.
    `.trim()
  );
};

const parseArgs = (argv: string[]): CliArgs => {
  const out: CliArgs = { execute: false, maxUpdates: 500, pretty: false, help: false };
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

const REPO_REGEX = /github\.com\/([^/]+)\/([^/]+)/;

const extractRepo = (nodeUrl?: string | null) => {
  if (!nodeUrl) return null;
  const match = nodeUrl.match(REPO_REGEX);
  if (!match) return null;
  return `${match[1]}/${match[2]}`;
};

const extractOrg = (nodeUrl?: string | null) => {
  if (!nodeUrl) return null;
  const match = nodeUrl.match(REPO_REGEX);
  if (!match) return null;
  return match[1];
};

const isValidSignature = (signature?: string | null) => {
  if (!signature) return false;
  if (!/^0x[0-9a-fA-F]+$/.test(signature)) return false;
  return signature.length === 130 || signature.length === 132;
};

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

const pageThrough = async <T>(fetchPage: (offset: number, limit: number) => Promise<T[]>): Promise<T[]> => {
  const pageSize = 1000;
  const rows: T[] = [];
  for (let offset = 0; ; offset += pageSize) {
    const page = await fetchPage(offset, pageSize);
    if (page.length === 0) break;
    rows.push(...page);
    if (page.length < pageSize) break;
  }
  return rows;
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

  const { client: supabase } = createSupabaseClientFromEnv({ preferServiceRole: true });

  const orgDefaults = new Map<string, OrgDefault>();
  const orgDefaultMeta = new Map<string, { createdMs: number; permitId: number }>();

  const partnerPermits = await pageThrough(async (offset, limit) => {
    const { data, error } = await supabase
      .from("permits")
      .select("id,created,partner_id,location:locations(node_url)")
      .not("partner_id", "is", null)
      .order("id", { ascending: true })
      .range(offset, offset + limit - 1);
    if (error) throw new Error(`Failed to load permits with partner_id: ${error.message}`);
    return (data ?? []) as PermitRow[];
  });

  for (const row of partnerPermits) {
    if (!row.partner_id) continue;
    const nodeUrl = row.location?.node_url ?? null;
    const org = extractOrg(nodeUrl);
    if (!org) continue;
    const createdMs = row.created ? Date.parse(row.created) : Number.NEGATIVE_INFINITY;
    const meta = orgDefaultMeta.get(org);
    const permitId = Number(row.id);
    const isNewer =
      !meta || createdMs > meta.createdMs || (createdMs === meta.createdMs && permitId > meta.permitId);

    if (!isNewer) continue;

    const repo = extractRepo(nodeUrl);
    orgDefaultMeta.set(org, { createdMs, permitId });
    orgDefaults.set(org, {
      org,
      partnerId: Number(row.partner_id),
      sourcePermitId: permitId,
      sourceCreated: row.created ?? null,
      sourceRepo: repo,
    });
  }

  const missingPartnerPermits = await pageThrough(async (offset, limit) => {
    const { data, error } = await supabase
      .from("permits")
      .select("id,created,partner_id,signature,location:locations(node_url)")
      .is("partner_id", null)
      .is("transaction", null)
      .order("id", { ascending: true })
      .range(offset, offset + limit - 1);
    if (error) throw new Error(`Failed to load permits missing partner_id: ${error.message}`);
    return (data ?? []) as PermitRow[];
  });

  const includeDetails = Boolean(args.out);
  const updates: ReportUpdate[] = [];
  const skipped: ReportSkip[] = [];

  const summary = {
    total: missingPartnerPermits.length,
    orgDefaults: orgDefaults.size,
    updatesAttempted: 0,
    updatesApplied: 0,
    skipped: {
      missingOrg: 0,
      invalidSignature: 0,
      orgDefaultMissing: 0,
      updateFailed: 0,
      maxUpdatesReached: 0,
    },
    updatedIds: [] as number[],
  };

  for (const permit of missingPartnerPermits) {
    if (summary.updatesAttempted >= args.maxUpdates) {
      summary.skipped.maxUpdatesReached += 1;
      break;
    }

    const nodeUrl = permit.location?.node_url ?? null;
    const repo = extractRepo(nodeUrl);
    const org = extractOrg(nodeUrl);

    if (!org) {
      summary.skipped.missingOrg += 1;
      if (includeDetails) {
        skipped.push({ id: permit.id, org: null, repo, nodeUrl, reason: "missingOrg" });
      }
      continue;
    }

    if (!isValidSignature(permit.signature ?? null)) {
      summary.skipped.invalidSignature += 1;
      if (includeDetails) {
        skipped.push({ id: permit.id, org, repo, nodeUrl, reason: "invalidSignature" });
      }
      continue;
    }

    const defaultEntry = orgDefaults.get(org);
    if (!defaultEntry) {
      summary.skipped.orgDefaultMissing += 1;
      if (includeDetails) {
        skipped.push({ id: permit.id, org, repo, nodeUrl, reason: "orgDefaultMissing" });
      }
      continue;
    }

    summary.updatesAttempted += 1;
    if (includeDetails) {
      updates.push({
        id: permit.id,
        org,
        repo,
        nodeUrl,
        partnerId: defaultEntry.partnerId,
        sourcePermitId: defaultEntry.sourcePermitId,
        sourceCreated: defaultEntry.sourceCreated,
      });
    }

    if (!args.execute) {
      summary.updatedIds.push(permit.id);
      continue;
    }

    const { error: updateError } = await supabase
      .from("permits")
      .update({ partner_id: defaultEntry.partnerId })
      .eq("id", permit.id);

    if (updateError) {
      summary.skipped.updateFailed += 1;
      if (includeDetails) {
        skipped.push({ id: permit.id, org, repo, nodeUrl, reason: "updateFailed" });
      }
      continue;
    }

    summary.updatedIds.push(permit.id);
    summary.updatesApplied += 1;
  }

  const output = {
    summary,
    orgDefaults: Array.from(orgDefaults.values()),
    ...(includeDetails ? { updates, skipped } : {}),
  };

  if (args.out) {
    await Deno.writeTextFile(args.out, stringifyJson(output, args.pretty));
  }

  console.log(stringifyJson({ summary, out: args.out ?? null }, args.pretty));
};

await main();
