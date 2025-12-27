#!/usr/bin/env -S deno run -A --ext=ts --env-file=.env

import { createSupabaseClientFromEnv, isHexAddress } from "./permit2-tools.ts";

type CliArgs = {
  out?: string;
  pretty: boolean;
  help: boolean;
};

type PermitRow = {
  id: number;
  created?: string | null;
  amount?: string | null;
  nonce?: string | null;
  deadline?: string | null;
  signature?: string | null;
  token_id?: number | null;
  network_id?: number | null;
  partner_id?: number | null;
  permit2_address?: string | null;
  transaction?: string | null;
  location?: { node_url?: string | null } | null;
  partner?: { wallet?: { address?: string | null } | null } | null;
  users?: { wallets?: { address?: string | null } | null } | null;
};

const DEFAULT_OUT = "reports/permit2-integrity-summary.json";
const SAMPLE_LIMIT = 20;

const printUsage = () => {
  console.error(
    `
Usage:
  deno run -A --env-file=.env scripts/permit2-integrity-summary.ts [--out <file>] [--pretty]

Options:
      --out     Output JSON path (default: ${DEFAULT_OUT}).
  -p, --pretty  Pretty-print JSON output.
  -h, --help    Show help.
    `.trim()
  );
};

const parseArgs = (argv: string[]): CliArgs => {
  const out: CliArgs = { pretty: false, help: false };
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

const orgFromUrl = (nodeUrl?: string | null) => {
  if (!nodeUrl) return "(none)";
  const match = String(nodeUrl).match(/github\.com\/([^/]+)\//);
  return match ? match[1] : "(non-github)";
};

const repoFromUrl = (nodeUrl?: string | null) => {
  if (!nodeUrl) return null;
  const match = String(nodeUrl).match(/github\.com\/([^/]+\/[^/]+)/);
  return match ? match[1] : null;
};

const isHexSignature = (value: string) => /^0x[0-9a-fA-F]+$/.test(value) && (value.length === 130 || value.length === 132);

const pushSample = <T>(list: T[], item: T) => {
  if (list.length < SAMPLE_LIMIT) list.push(item);
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

  const outPath = args.out ?? DEFAULT_OUT;
  const { client: supabase } = createSupabaseClientFromEnv({ preferServiceRole: true });

  const count = async (query: ReturnType<typeof supabase.from>) => {
    const { count, error } = await query;
    if (error) throw new Error(error.message);
    return count ?? 0;
  };

  const counts = {
    permitsTotal: await count(supabase.from("permits").select("id", { count: "exact", head: true })),
    permitsUnclaimed: await count(supabase.from("permits").select("id", { count: "exact", head: true }).is("transaction", null)),
    missingTokenId: await count(supabase.from("permits").select("id", { count: "exact", head: true }).is("token_id", null)),
    missingTokenIdUnclaimed: await count(
      supabase.from("permits").select("id", { count: "exact", head: true }).is("token_id", null).is("transaction", null)
    ),
    missingNetworkId: await count(supabase.from("permits").select("id", { count: "exact", head: true }).is("network_id", null)),
    missingPartnerId: await count(supabase.from("permits").select("id", { count: "exact", head: true }).is("partner_id", null)),
    missingPermit2Address: await count(supabase.from("permits").select("id", { count: "exact", head: true }).is("permit2_address", null)),
  };

  const { data: tokens, error: tokenError } = await supabase.from("tokens").select("id,address,network");
  if (tokenError) throw new Error(`Failed to load tokens: ${tokenError.message}`);
  const invalidTokens = (tokens ?? []).filter((row) => {
    const address = row.address ? String(row.address) : "";
    const network = Number(row.network ?? 0);
    return !isHexAddress(address) || !Number.isFinite(network) || network <= 0;
  });

  const { data: partners, error: partnerError } = await supabase.from("partners").select("id,wallet_id,wallet:wallets(address)");
  if (partnerError) throw new Error(`Failed to load partners: ${partnerError.message}`);
  const partnersMissingWallet = (partners ?? []).filter((row) => !row.wallet_id || !row.wallet?.address);

  const { data: users, error: userError } = await supabase.from("users").select("id,wallet_id,wallets(address)");
  if (userError) throw new Error(`Failed to load users: ${userError.message}`);
  const usersMissingWallet = (users ?? []).filter((row) => !row.wallet_id || !row.wallets?.address);

  const permits = await pageThrough(async (offset, limit) => {
    const { data, error } = await supabase
      .from("permits")
      .select(
        `
          id,
          created,
          amount,
          nonce,
          deadline,
          signature,
          token_id,
          network_id,
          partner_id,
          permit2_address,
          transaction,
          location:locations(node_url),
          partner:partners(wallet:wallets(address)),
          users:users(wallets(address))
        `
      )
      .order("id", { ascending: true })
      .range(offset, offset + limit - 1);
    if (error) throw new Error(`Failed to load permits: ${error.message}`);
    return (data ?? []) as PermitRow[];
  });

  const missingTokenRows: PermitRow[] = [];
  const missingPartnerRows: PermitRow[] = [];
  const invalidPermits: Array<{ id: number; org: string; repo: string | null; node_url: string | null; reasons: string[] }> = [];
  const missingBeneficiaryWallet: number[] = [];
  const orgCounts = new Map<string, number>();
  const missingTokenByOrg = new Map<string, number>();

  for (const row of permits) {
    const org = orgFromUrl(row.location?.node_url ?? null);
    const repo = repoFromUrl(row.location?.node_url ?? null);
    const nodeUrl = row.location?.node_url ? String(row.location.node_url) : null;
    orgCounts.set(org, (orgCounts.get(org) ?? 0) + 1);

    if (row.token_id == null) {
      missingTokenRows.push(row);
      missingTokenByOrg.set(org, (missingTokenByOrg.get(org) ?? 0) + 1);
    }
    if (row.partner_id == null) missingPartnerRows.push(row);
    if (!row.users?.wallets?.address) pushSample(missingBeneficiaryWallet, row.id);

    const reasons: string[] = [];
    const signature = row.signature ? String(row.signature) : "";
    if (!signature) {
      reasons.push("missing_signature");
    } else if (!signature.startsWith("0x")) {
      reasons.push("invalid_signature_prefix");
    } else if (!isHexSignature(signature)) {
      reasons.push("invalid_signature_format");
    }
    try {
      BigInt(row.amount ?? "");
    } catch {
      reasons.push("invalid_amount");
    }
    try {
      BigInt(row.nonce ?? "");
    } catch {
      reasons.push("invalid_nonce");
    }
    try {
      BigInt(row.deadline ?? "");
    } catch {
      reasons.push("invalid_deadline");
    }
    if (reasons.length > 0) {
      invalidPermits.push({ id: row.id, org, repo, node_url: nodeUrl, reasons });
    }
  }

  const report = {
    generatedAt: new Date().toISOString(),
    counts,
    tables: {
      tokens: {
        total: tokens?.length ?? 0,
        invalid: invalidTokens.length,
        invalidIds: invalidTokens.map((row) => row.id),
      },
      partners: {
        total: partners?.length ?? 0,
        missingWallet: partnersMissingWallet.length,
        missingWalletIds: partnersMissingWallet.map((row) => row.id),
      },
      users: {
        total: users?.length ?? 0,
        missingWallet: usersMissingWallet.length,
        missingWalletIds: usersMissingWallet.map((row) => row.id),
      },
    },
    buckets: {
      missingTokenId: {
        count: missingTokenRows.length,
        rows: missingTokenRows.map((row) => ({
          id: row.id,
          created: row.created ?? null,
          org: orgFromUrl(row.location?.node_url ?? null),
          repo: repoFromUrl(row.location?.node_url ?? null),
          node_url: row.location?.node_url ?? null,
          partner_id: row.partner_id ?? null,
          partner_wallet: row.partner?.wallet?.address ?? null,
          beneficiary_wallet: row.users?.wallets?.address ?? null,
          permit2_address: row.permit2_address ?? null,
          transaction: row.transaction ?? null,
        })),
      },
      missingPartnerId: {
        count: missingPartnerRows.length,
        rows: missingPartnerRows.map((row) => ({
          id: row.id,
          created: row.created ?? null,
          org: orgFromUrl(row.location?.node_url ?? null),
          repo: repoFromUrl(row.location?.node_url ?? null),
          node_url: row.location?.node_url ?? null,
        })),
      },
      invalidPermits: {
        count: invalidPermits.length,
        rows: invalidPermits,
      },
      missingBeneficiaryWalletSample: {
        count: missingBeneficiaryWallet.length,
        ids: missingBeneficiaryWallet,
      },
    },
    orgBreakdown: {
      permitsByOrg: Array.from(orgCounts.entries())
        .map(([org, count]) => ({ org, count }))
        .sort((a, b) => b.count - a.count),
      missingTokenByOrg: Array.from(missingTokenByOrg.entries())
        .map(([org, count]) => ({ org, count }))
        .sort((a, b) => b.count - a.count),
    },
  };

  await Deno.writeTextFile(outPath, stringifyJson(report, args.pretty));
  console.log(stringifyJson({ out: outPath, counts: report.counts, missingTokenCount: report.buckets.missingTokenId.count }, args.pretty));
};

await main();
