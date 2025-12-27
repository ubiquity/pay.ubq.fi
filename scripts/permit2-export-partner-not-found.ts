#!/usr/bin/env -S deno run -A --ext=ts --env-file=.env

import { createSupabaseClientFromEnv } from "./permit2-tools.ts";

type ReportRecovery = {
  tokenId: number;
  tokenAddress: string;
  networkId: number;
  permit2: string;
  owner: string;
  partnerId?: number;
};

type ReportSkip = {
  id: number;
  created: string | null;
  repo: string | null;
  nodeUrl: string | null;
  reason: string;
  recoveries?: ReportRecovery[];
};

type PermitRow = {
  id: number;
  amount: string;
  nonce: string;
  deadline: string;
  token_id: number | null;
  network_id: number | null;
  permit2_address: string | null;
  created: string | null;
  location?: { node_url?: string | null } | null;
};

const REPORT_URL = new URL("../reports/permit2-backfill-remaining.json", import.meta.url);
const OUT_JSON_URL = new URL("../reports/permit2-backfill-partner-not-found.json", import.meta.url);
const OUT_CSV_URL = new URL("../reports/permit2-backfill-partner-not-found.csv", import.meta.url);

const loadReport = async () => {
  const raw = await Deno.readTextFile(REPORT_URL);
  const parsed = JSON.parse(raw) as { skipped?: ReportSkip[] };
  return parsed.skipped ?? [];
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

const main = async () => {
  const skipped = await loadReport();
  const partnerNotFound = skipped.filter((entry) => entry.reason === "partnerNotFound");
  const ids = partnerNotFound.map((entry) => entry.id);

  if (ids.length === 0) {
    console.log("No partnerNotFound rows found in report.");
    return;
  }

  const { client: supabase } = createSupabaseClientFromEnv({ preferServiceRole: true });
  const { data, error } = await supabase
    .from("permits")
    .select("id,amount,nonce,deadline,token_id,network_id,permit2_address,created,location:locations(node_url)")
    .in("id", ids);

  if (error) throw new Error(`Failed to load permits: ${error.message}`);

  const permitMap = new Map<number, PermitRow>();
  for (const row of data ?? []) {
    if (!row?.id) continue;
    permitMap.set(Number(row.id), row as PermitRow);
  }

  const rows = partnerNotFound.map((entry) => {
    const permit = permitMap.get(entry.id);
    const repo = entry.repo ?? null;
    const org = repo ? repo.split("/")[0] ?? null : null;
    const nodeUrl = entry.nodeUrl ?? permit?.location?.node_url ?? null;
    const recoveries = entry.recoveries ?? [];
    const ownerCandidates = Array.from(new Set(recoveries.map((rec) => rec.owner))).join("|");

    return {
      permit_id: entry.id,
      created_at: permit?.created ?? entry.created ?? null,
      repo,
      org,
      node_url: nodeUrl,
      amount: permit?.amount ?? null,
      nonce: permit?.nonce ?? null,
      deadline: permit?.deadline ?? null,
      token_id: permit?.token_id ?? null,
      network_id: permit?.network_id ?? null,
      permit2_address: permit?.permit2_address ?? null,
      owner_candidates: ownerCandidates,
      recovery_count: recoveries.length,
      recoveries_json: JSON.stringify(recoveries),
    };
  });

  const headers = [
    "permit_id",
    "created_at",
    "repo",
    "org",
    "node_url",
    "amount",
    "nonce",
    "deadline",
    "token_id",
    "network_id",
    "permit2_address",
    "owner_candidates",
    "recovery_count",
    "recoveries_json",
  ];

  await Deno.writeTextFile(OUT_JSON_URL, JSON.stringify(rows, null, 2));
  await Deno.writeTextFile(OUT_CSV_URL, toCsv(rows, headers));

  console.log(`Wrote ${rows.length} rows to ${OUT_CSV_URL.pathname}`);
};

await main();
