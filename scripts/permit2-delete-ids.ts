#!/usr/bin/env -S deno run -A --ext=ts --env-file=.env

import { createSupabaseClientFromEnv } from "./permit2-tools.ts";

type CliArgs = {
  ids: number[];
  help: boolean;
};

const printUsage = () => {
  console.error(
    `
Usage:
  deno run -A --env-file=.env scripts/permit2-delete-ids.ts --ids <comma-separated>
  deno run -A --env-file=.env scripts/permit2-delete-ids.ts --id <n> [--id <n> ...]

Options:
  --ids       Comma-separated list of permit ids.
  --id        Provide an id; can be repeated.
  -h, --help  Show help.
    `.trim()
  );
};

const parseArgs = (argv: string[]): CliArgs => {
  const out: CliArgs = { ids: [], help: false };
  const pushIds = (values: number[]) => {
    for (const id of values) {
      if (Number.isFinite(id)) out.ids.push(id);
    }
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      out.help = true;
      continue;
    }
    if (arg === "--ids") {
      const next = argv[i + 1];
      i += 1;
      if (!next || next.startsWith("-")) throw new Error("Missing value for --ids");
      pushIds(
        next
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean)
          .map((value) => Number(value))
      );
      continue;
    }
    if (arg.startsWith("--ids=")) {
      pushIds(
        arg
          .slice("--ids=".length)
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean)
          .map((value) => Number(value))
      );
      continue;
    }
    if (arg === "--id") {
      const next = argv[i + 1];
      i += 1;
      if (!next || next.startsWith("-")) throw new Error("Missing value for --id");
      pushIds([Number(next)]);
      continue;
    }
    if (arg.startsWith("--id=")) {
      pushIds([Number(arg.slice("--id=".length))]);
      continue;
    }
    if (arg.startsWith("-")) throw new Error(`Unknown option: ${arg}`);
    throw new Error(`Unexpected positional arg: ${arg}`);
  }

  out.ids = Array.from(new Set(out.ids)).filter((id) => Number.isFinite(id));
  return out;
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

  if (args.ids.length === 0) {
    console.error("No permit ids provided.");
    printUsage();
    Deno.exit(1);
    return;
  }

  const { client: supabase } = createSupabaseClientFromEnv({ preferServiceRole: true });
  const { data, error } = await supabase.from("permits").delete().in("id", args.ids).select("id");
  if (error) throw new Error(`Failed to delete permits: ${error.message}`);

  const deletedIds = (data ?? []).map((row) => row.id).sort((a, b) => a - b);
  const missingIds = args.ids.filter((id) => !deletedIds.includes(id));

  console.log(
    JSON.stringify(
      {
        requested: args.ids.slice().sort((a, b) => a - b),
        deleted: deletedIds.length,
        deletedIds,
        missingIds,
      },
      null,
      2
    )
  );
};

await main();
