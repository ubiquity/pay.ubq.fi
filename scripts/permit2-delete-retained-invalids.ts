#!/usr/bin/env -S deno run -A --ext=ts --env-file=.env

import { createSupabaseClientFromEnv } from "./permit2-tools.ts";

type InvalidRow = { id: string };

const INVALIDS_URL = new URL("../reports/permit2-backfill-invalids-retained.json", import.meta.url);

const main = async () => {
  const raw = await Deno.readTextFile(INVALIDS_URL);
  const invalids = JSON.parse(raw) as InvalidRow[];
  const ids = invalids.map((row) => Number(row.id)).filter((id) => Number.isFinite(id));

  if (ids.length === 0) {
    console.log("No retained invalid ids found.");
    return;
  }

  const { client: supabase } = createSupabaseClientFromEnv({ preferServiceRole: true });
  const { data, error } = await supabase.from("permits").delete().in("id", ids).select("id");

  if (error) throw new Error(`Failed to delete permits: ${error.message}`);

  const deletedIds = (data ?? []).map((row) => row.id).sort((a, b) => a - b);
  const summary = {
    requested: ids.length,
    deleted: deletedIds.length,
    deletedIds,
    missingIds: ids.filter((id) => !deletedIds.includes(id)),
  };

  console.log(JSON.stringify(summary, null, 2));
};

await main();
