#!/usr/bin/env -S deno run -A --ext=ts --env-file=.env

import { createSupabaseClientFromEnv } from "./permit2-tools.ts";

type CliArgs = {
  repo?: string;
  hours: number;
  timeField: "created" | "updated" | "either";
  username?: string;
  out?: string;
  pretty: boolean;
  help: boolean;
};

type PermitRow = {
  id: number;
  amount: string;
  nonce: string;
  deadline: string;
  signature: string;
  beneficiary_id: number;
  location_id: number | null;
  token_id: number | null;
  partner_id: number | null;
  network_id: number | null;
  permit2_address: string | null;
  transaction: string | null;
  created: string;
  updated: string | null;
  location?: { node_url?: string | null } | null;
  token?: { address?: string | null; network?: number | string | null } | null;
  partner?: { id?: number | null; wallet?: { address?: string | null } | null } | null;
  beneficiary?: { id?: number | null; wallet?: { address?: string | null } | null; location?: { node_url?: string | null } | null } | null;
};

const printUsage = () => {
  console.error(
    `
Usage:
  deno run -A --env-file=.env scripts/permit2-export-repo-permits.ts --repo <org/repo> [--hours <n>] [--time-field <created|updated|either>] [--username <handle>] [--out <file>]

Options:
  --repo        Repo slug like ubiquity-os-marketplace/text-conversation-rewards (required).
  --hours       Lookback window in hours (default: 24).
  --time-field  Which timestamp to filter on: created, updated, or either (default: created).
  --username    Optional GitHub username filter (client-side).
  --out         Output CSV path (default: reports/permits-last-<hours>h-<repo>.csv).
  -p, --pretty  Pretty-print JSON summary.
  -h, --help    Show help.
    `.trim()
  );
};

const parseArgs = (argv: string[]): CliArgs => {
  const out: CliArgs = { hours: 24, timeField: "created", pretty: false, help: false };
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
    if (arg === "--repo") {
      out.repo = takeValue(arg, argv[i + 1]);
      i += 1;
      continue;
    }
    if (arg.startsWith("--repo=")) {
      out.repo = arg.slice("--repo=".length);
      continue;
    }
    if (arg === "--hours") {
      const v = Number(takeValue(arg, argv[i + 1]));
      i += 1;
      if (!Number.isFinite(v) || v <= 0) throw new Error(`Invalid --hours: ${argv[i]}`);
      out.hours = v;
      continue;
    }
    if (arg.startsWith("--hours=")) {
      const v = Number(arg.slice("--hours=".length));
      if (!Number.isFinite(v) || v <= 0) throw new Error(`Invalid --hours: ${v}`);
      out.hours = v;
      continue;
    }
    if (arg === "--time-field") {
      const value = takeValue(arg, argv[i + 1]);
      i += 1;
      if (value !== "created" && value !== "updated" && value !== "either") {
        throw new Error(`Invalid --time-field: ${value}`);
      }
      out.timeField = value;
      continue;
    }
    if (arg.startsWith("--time-field=")) {
      const value = arg.slice("--time-field=".length);
      if (value !== "created" && value !== "updated" && value !== "either") {
        throw new Error(`Invalid --time-field: ${value}`);
      }
      out.timeField = value;
      continue;
    }
    if (arg === "--username") {
      out.username = takeValue(arg, argv[i + 1]);
      i += 1;
      continue;
    }
    if (arg.startsWith("--username=")) {
      out.username = arg.slice("--username=".length);
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

const escapeCsvValue = (value: unknown) => {
  if (value === null || value === undefined) return "";
  const text = String(value);
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, "\"\"")}"`;
  }
  return text;
};

const toCsv = (rows: Record<string, unknown>[], headers: string[]) => {
  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(headers.map((header) => escapeCsvValue(row[header])).join(","));
  }
  return `${lines.join("\n")}\n`;
};

const extractRepo = (nodeUrl?: string | null) => {
  if (!nodeUrl) return null;
  const match = nodeUrl.match(/github\.com\/([^/]+\/[^/]+)/);
  return match ? match[1] : null;
};

const extractUsername = (nodeUrl?: string | null) => {
  if (!nodeUrl) return null;
  const match = nodeUrl.match(/github\.com\/([^/]+)/);
  return match ? match[1] : null;
};

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

const chunkArray = <T>(values: T[], size: number): T[][] => {
  const chunks: T[][] = [];
  for (let i = 0; i < values.length; i += size) {
    chunks.push(values.slice(i, i + size));
  }
  return chunks;
};

const matchesSince = (row: PermitRow, sinceMs: number, timeField: CliArgs["timeField"]) => {
  const createdMs = row.created ? Date.parse(row.created) : Number.NaN;
  const updatedMs = row.updated ? Date.parse(row.updated) : Number.NaN;
  if (timeField === "created") return createdMs >= sinceMs;
  if (timeField === "updated") return updatedMs >= sinceMs;
  return createdMs >= sinceMs || updatedMs >= sinceMs;
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

  if (args.help || !args.repo) {
    printUsage();
    if (!args.repo) Deno.exit(1);
    return;
  }

  const sinceMs = Date.now() - args.hours * 60 * 60 * 1000;
  const sinceIso = new Date(sinceMs).toISOString();
  const repoPrefix = `https://github.com/${args.repo}/`;
  const usernameLower = args.username?.toLowerCase() ?? null;

  const { client: supabase } = createSupabaseClientFromEnv({ preferServiceRole: true });
  const selectQuery = `
    id,
    amount,
    nonce,
    deadline,
    signature,
    beneficiary_id,
    location_id,
    token_id,
    partner_id,
    network_id,
    permit2_address,
    transaction,
    created,
    updated,
    location:locations!inner(node_url),
    token:tokens(address, network),
    partner:partners(id, wallet:wallets(address)),
    beneficiary:users(id, wallet:wallets(address), location:locations(node_url))
  `;

  const locations = await pageThrough(async (offset, limit) => {
    const { data, error } = await supabase
      .from("locations")
      .select("id,node_url")
      .ilike("node_url", `${repoPrefix}%`)
      .order("id", { ascending: true })
      .range(offset, offset + limit - 1);
    if (error) throw new Error(`Failed to load locations: ${error.message}`);
    return (data ?? []) as { id: number; node_url?: string | null }[];
  });

  const locationIds = locations.map((row) => row.id).filter((id) => Number.isFinite(id));
  if (locationIds.length === 0) {
    const defaultOut = `reports/permits-last-${args.hours}h-${args.repo.replace("/", "-")}.csv`;
    const outPath = args.out ?? defaultOut;
    await Deno.writeTextFile(outPath, toCsv([], [
      "id",
      "amount",
      "nonce",
      "deadline",
      "signature",
      "beneficiary_id",
      "location_id",
      "token_id",
      "partner_id",
      "network_id",
      "permit2_address",
      "transaction",
      "created",
      "updated",
      "location_node_url",
      "repo",
      "token_address",
      "token_network",
      "partner_wallet_address",
      "beneficiary_wallet_address",
      "beneficiary_node_url",
      "beneficiary_username",
    ]));
    console.log(
      JSON.stringify(
        {
          repo: args.repo,
          since: sinceIso,
          hours: args.hours,
          timeField: args.timeField,
          username: args.username ?? null,
          rows: 0,
          out: outPath,
          locationRows: 0,
        },
        null,
        args.pretty ? 2 : undefined
      )
    );
    return;
  }

  const permits: PermitRow[] = [];
  for (const chunk of chunkArray(locationIds, 500)) {
    const chunkPermits = await pageThrough(async (offset, limit) => {
      const query = supabase
        .from("permits")
        .select(selectQuery)
        .in("location_id", chunk)
        .order("created", { ascending: true })
        .range(offset, offset + limit - 1);

      const { data, error } = await query;
      if (error) throw new Error(`Failed to load permits: ${error.message}`);
      return (data ?? []) as PermitRow[];
    });
    permits.push(...chunkPermits);
  }

  const filteredByTime = permits.filter((row) => matchesSince(row, sinceMs, args.timeField));
  const filtered = usernameLower
    ? filteredByTime.filter((row) => {
        const username = extractUsername(row.beneficiary?.location?.node_url ?? null);
        return username?.toLowerCase() === usernameLower;
      })
    : filteredByTime;

  const rows = filtered.map((row) => {
    const nodeUrl = row.location?.node_url ?? null;
    const beneficiaryUrl = row.beneficiary?.location?.node_url ?? null;
    const repo = extractRepo(nodeUrl);

    return {
      id: row.id,
      amount: row.amount,
      nonce: row.nonce,
      deadline: row.deadline,
      signature: row.signature,
      beneficiary_id: row.beneficiary_id,
      location_id: row.location_id,
      token_id: row.token_id,
      partner_id: row.partner_id,
      network_id: row.network_id,
      permit2_address: row.permit2_address,
      transaction: row.transaction,
      created: row.created,
      updated: row.updated,
      location_node_url: nodeUrl,
      repo,
      token_address: row.token?.address ?? null,
      token_network: row.token?.network ?? null,
      partner_wallet_address: row.partner?.wallet?.address ?? null,
      beneficiary_wallet_address: row.beneficiary?.wallet?.address ?? null,
      beneficiary_node_url: beneficiaryUrl,
      beneficiary_username: extractUsername(beneficiaryUrl),
    };
  });

  const headers = [
    "id",
    "amount",
    "nonce",
    "deadline",
    "signature",
    "beneficiary_id",
    "location_id",
    "token_id",
    "partner_id",
    "network_id",
    "permit2_address",
    "transaction",
    "created",
    "updated",
    "location_node_url",
    "repo",
    "token_address",
    "token_network",
    "partner_wallet_address",
    "beneficiary_wallet_address",
    "beneficiary_node_url",
    "beneficiary_username",
  ];

  const defaultOut = `reports/permits-last-${args.hours}h-${args.repo.replace("/", "-")}.csv`;
  const outPath = args.out ?? defaultOut;

  await Deno.writeTextFile(outPath, toCsv(rows, headers));

  const summary = {
    repo: args.repo,
    since: sinceIso,
    hours: args.hours,
    timeField: args.timeField,
    username: args.username ?? null,
    rows: rows.length,
    locationRows: locationIds.length,
    out: outPath,
  };

  console.log(JSON.stringify(summary, null, args.pretty ? 2 : undefined));
};

await main();
