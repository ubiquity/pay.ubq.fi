#!/usr/bin/env -S deno run -A --ext=ts --env-file=.env

import { createSupabaseClientFromEnv } from "./permit2-tools.ts";

type InvalidRow = {
  id: string;
  nonce: string;
  repo?: string;
  node_url?: string;
};

type PermitRow = {
  id: number;
  partner_id: number | null;
  transaction: string | null;
  signature: string | null;
  nonce: string;
  amount: string | null;
  deadline: string | null;
  created: string | null;
  token_id: number | null;
  network_id: number | null;
  permit2_address: string | null;
  location?: { node_url?: string | null } | null;
};

const INVALIDS_URL = new URL("../reports/permit2-backfill-invalids-retained.json", import.meta.url);
const REPORT_URL = new URL("../reports/permit2-backfill-invalids-regenerated-status.json", import.meta.url);

const isValidSignature = (signature?: string | null) => {
  if (!signature) return false;
  if (!/^0x[0-9a-fA-F]+$/.test(signature)) return false;
  return signature.length === 130 || signature.length === 132;
};

const main = async () => {
  const invalids = JSON.parse(await Deno.readTextFile(INVALIDS_URL)) as InvalidRow[];
  const ids = invalids.map((row) => Number(row.id)).filter((id) => Number.isFinite(id));
  const nonces = invalids.map((row) => row.nonce).filter((nonce) => Boolean(nonce));
  const nodeUrls = Array.from(
    new Set(
      invalids
        .map((row) => row.node_url)
        .filter((nodeUrl): nodeUrl is string => Boolean(nodeUrl))
    )
  );

  if (ids.length === 0) {
    console.log("No retained invalid rows found.");
    return;
  }

  const { client: supabase } = createSupabaseClientFromEnv({ preferServiceRole: true });
  const selectQuery =
    "id,partner_id,transaction,signature,nonce,amount,deadline,created,token_id,network_id,permit2_address,location:locations(node_url)";

  const { data: byId, error: idError } = await supabase.from("permits").select(selectQuery).in("id", ids);
  if (idError) throw new Error(`Failed to fetch permits by id: ${idError.message}`);

  const { data: byNonce, error: nonceError } = await supabase.from("permits").select(selectQuery).in("nonce", nonces);
  if (nonceError) throw new Error(`Failed to fetch permits by nonce: ${nonceError.message}`);

  const locationRows =
    nodeUrls.length > 0
      ? await supabase.from("locations").select("id,node_url").in("node_url", nodeUrls)
      : { data: [] as { id: number; node_url?: string | null }[], error: null };
  if (locationRows.error) throw new Error(`Failed to fetch locations: ${locationRows.error.message}`);

  const locationByUrl = new Map<string, number>();
  for (const row of locationRows.data ?? []) {
    if (!row?.id || !row.node_url) continue;
    locationByUrl.set(row.node_url, Number(row.id));
  }

  const locationIds = Array.from(new Set(Array.from(locationByUrl.values())));
  const { data: byLocation, error: locationError } =
    locationIds.length > 0
      ? await supabase.from("permits").select(selectQuery).in("location_id", locationIds)
      : { data: [] as PermitRow[], error: null };
  if (locationError) throw new Error(`Failed to fetch permits by location: ${locationError.message}`);

  const byIdMap = new Map<number, PermitRow>();
  for (const row of (byId ?? []) as PermitRow[]) {
    if (!row?.id) continue;
    byIdMap.set(Number(row.id), row);
  }

  const byNonceMap = new Map<string, PermitRow[]>();
  for (const row of (byNonce ?? []) as PermitRow[]) {
    if (!row?.nonce) continue;
    const list = byNonceMap.get(row.nonce) ?? [];
    list.push(row);
    byNonceMap.set(row.nonce, list);
  }

  const byNodeUrlMap = new Map<string, PermitRow[]>();
  for (const row of (byLocation ?? []) as PermitRow[]) {
    const nodeUrl = row.location?.node_url ?? null;
    if (!nodeUrl) continue;
    const list = byNodeUrlMap.get(nodeUrl) ?? [];
    list.push(row);
    byNodeUrlMap.set(nodeUrl, list);
  }

  const report = invalids.map((entry) => {
    const id = Number(entry.id);
    const row = byIdMap.get(id) ?? null;
    const nonceRows = byNonceMap.get(entry.nonce) ?? [];
    const replacements = nonceRows.filter((item) => item.id !== id && item.partner_id !== null);
    const nodeUrl = entry.node_url ?? null;
    const nodeRows = nodeUrl ? byNodeUrlMap.get(nodeUrl) ?? [] : [];
    const regenCandidates = nodeRows.filter((item) => item.partner_id !== null && isValidSignature(item.signature));

    return {
      id: entry.id,
      repo: entry.repo ?? null,
      node_url: nodeUrl,
      nonce: entry.nonce,
      invalid_row: row
        ? {
            exists: true,
            partner_id: row.partner_id,
            transaction: row.transaction,
            signature_valid: isValidSignature(row.signature),
            created: row.created,
          }
        : { exists: false, partner_id: null, transaction: null, signature_valid: false, created: null },
      nonce_matches: {
        total: nonceRows.length,
        replacement_count: replacements.length,
        replacement_ids: replacements.map((item) => item.id),
        replacements: replacements.map((item) => ({
          id: item.id,
          partner_id: item.partner_id,
          created: item.created,
          signature_valid: isValidSignature(item.signature),
        })),
      },
      node_url_matches: {
        total: nodeRows.length,
        regenerated_count: regenCandidates.length,
        regenerated_ids: regenCandidates.map((item) => item.id),
        permits: nodeRows.map((item) => ({
          id: item.id,
          partner_id: item.partner_id,
          created: item.created,
          signature_valid: isValidSignature(item.signature),
          transaction: item.transaction,
        })),
      },
    };
  });

  const summary = {
    retained_invalids: invalids.length,
    still_invalid: report.filter((entry) => entry.invalid_row.exists && entry.invalid_row.partner_id === null).length,
    replacements_found: report.filter((entry) => entry.nonce_matches.replacement_count > 0).length,
    regenerated_by_node_url: report.filter((entry) => entry.node_url_matches.regenerated_count > 0).length,
  };

  await Deno.writeTextFile(REPORT_URL, JSON.stringify({ summary, report }, null, 2));
  console.log(JSON.stringify({ summary, report_path: REPORT_URL.pathname }, null, 2));
};

await main();
