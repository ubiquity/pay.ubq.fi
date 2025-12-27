#!/usr/bin/env -S deno run -A --ext=ts --env-file=.env

import { hashTypedData, recoverAddress } from "viem";
import {
  createSupabaseClientFromEnv,
  isHexAddress,
  NEW_PERMIT2_ADDRESS,
  normalizeHexAddress,
  OLD_PERMIT2_ADDRESS,
  PERMIT2_DOMAIN_NAME,
  PERMIT_TRANSFER_FROM_TYPES,
} from "./permit2-tools.ts";

type CliArgs = {
  execute: boolean;
  createPartners: boolean;
  maxUpdates: number;
  out?: string;
  pretty: boolean;
  help: boolean;
};

type TokenInfo = { id: number; address: string; network: number };

type PermitRow = {
  id: number;
  amount: string;
  nonce: string;
  deadline: string;
  signature: string;
  permit2_address?: string | null;
  created?: string | null;
  token_id?: number | null;
  network_id?: number | null;
  partner_id?: number | null;
  location?: { node_url?: string | null } | null;
  partner?: { wallet?: { address?: string | null } | null } | null;
  users?: { wallets?: { address?: string | null } | null } | null;
};

type Match = {
  tokenId: number;
  tokenAddress: string;
  networkId: number;
  permit2Address: string;
  signer: string;
  walletId: number;
  partnerId: number | null;
};

const printUsage = () => {
  console.error(
    `
Usage:
  deno run -A --env-file=.env scripts/permit2-backfill-missing-tokens.ts [--execute] [--create-partners]
    [--max-updates <n>] [--out <file>] [--pretty]

What it does:
  - Finds permits with token_id IS NULL.
  - Re-derives token + permit2 address by validating the signature against known tokens.
  - Only applies updates when there is exactly ONE verified match tied to a known wallet.

Options:
      --execute          Write updates to Supabase (default: false; dry-run).
      --create-partners  Allow creating partners when signer wallet exists but no partner row (default: false).
      --max-updates      Safety limit for number of permit rows to update (default: 200).
      --out              Write full report JSON to a file (otherwise prints summary only).
  -p, --pretty           Pretty-print JSON output.
  -h, --help             Show help.

Env:
  SUPABASE_URL or VITE_SUPABASE_URL
  SUPABASE_ANON_KEY or VITE_SUPABASE_ANON_KEY (fallback: SUPABASE_SERVICE_ROLE_KEY)
    `.trim()
  );
};

const parseArgs = (argv: string[]): CliArgs => {
  const out: CliArgs = { execute: false, createPartners: false, maxUpdates: 200, pretty: false, help: false };
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
    if (arg === "--create-partners") {
      out.createPartners = true;
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

const isValidSignature = (signature: string) => /^0x[0-9a-fA-F]+$/.test(signature) && (signature.length === 130 || signature.length === 132);

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

const uniqueAddresses = (values: string[]) => {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const normalized = normalizeHexAddress(value);
    if (!seen.has(normalized)) {
      seen.add(normalized);
      out.push(normalized);
    }
  }
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

  const { client: supabase } = createSupabaseClientFromEnv({ preferServiceRole: true });

  const { data: tokens, error: tokenError } = await supabase.from("tokens").select("id,address,network");
  if (tokenError) throw new Error(`Failed to load tokens: ${tokenError.message}`);

  const tokenList: TokenInfo[] = [];
  for (const token of tokens ?? []) {
    if (!token.id || !token.address) continue;
    const network = Number(token.network ?? 0);
    if (!Number.isFinite(network) || network <= 0) continue;
    tokenList.push({ id: Number(token.id), address: normalizeHexAddress(String(token.address)), network });
  }

  const { data: wallets, error: walletError } = await supabase.from("wallets").select("id,address");
  if (walletError) throw new Error(`Failed to load wallets: ${walletError.message}`);
  const walletByAddress = new Map<string, number>();
  for (const wallet of wallets ?? []) {
    const address = wallet.address ? normalizeHexAddress(String(wallet.address)).toLowerCase() : null;
    if (!address || !wallet.id) continue;
    walletByAddress.set(address, Number(wallet.id));
  }

  const { data: partners, error: partnerError } = await supabase.from("partners").select("id,wallet:wallets(address)");
  if (partnerError) throw new Error(`Failed to load partners: ${partnerError.message}`);
  const partnerByAddress = new Map<string, number>();
  for (const partner of partners ?? []) {
    const address = partner.wallet?.address ? normalizeHexAddress(String(partner.wallet.address)).toLowerCase() : null;
    if (!address || !partner.id) continue;
    partnerByAddress.set(address, Number(partner.id));
  }

  const permitRows = await pageThrough(async (offset, limit) => {
    const { data, error } = await supabase
      .from("permits")
      .select(
        `
          id,
          amount,
          nonce,
          deadline,
          signature,
          permit2_address,
          created,
          token_id,
          network_id,
          partner_id,
          location:locations(node_url),
          partner:partners(wallet:wallets(address)),
          users:users(wallets(address))
        `
      )
      .is("token_id", null)
      .order("id", { ascending: true })
      .range(offset, offset + limit - 1);
    if (error) throw new Error(`Failed to load permits: ${error.message}`);
    return (data ?? []) as PermitRow[];
  });

  const permit2Candidates = uniqueAddresses([NEW_PERMIT2_ADDRESS, OLD_PERMIT2_ADDRESS]);
  const createdPartnersByWallet = new Map<number, number>();
  const updates: Array<{ id: number; updatePayload: Record<string, unknown>; match: Match; nodeUrl: string | null }> = [];
  const skipped: Array<{ id: number; reason: string; nodeUrl: string | null; matches?: Match[] }> = [];

  const summary = {
    total: permitRows.length,
    matched: 0,
    updatesAttempted: 0,
    updatesApplied: 0,
    skipped: {
      invalidSignature: 0,
      invalidAmount: 0,
      invalidNonce: 0,
      invalidDeadline: 0,
      missingBeneficiary: 0,
      missingPermit2: 0,
      noMatch: 0,
      ambiguousMatch: 0,
      missingPartner: 0,
      updateFailed: 0,
      maxUpdatesReached: 0,
    },
  };

  for (const row of permitRows) {
    if (summary.updatesAttempted >= args.maxUpdates) {
      summary.skipped.maxUpdatesReached += 1;
      break;
    }

    const nodeUrl = row.location?.node_url ? String(row.location.node_url) : null;
    const beneficiaryRaw = row.users?.wallets?.address ?? null;
    if (!beneficiaryRaw || !isHexAddress(String(beneficiaryRaw))) {
      summary.skipped.missingBeneficiary += 1;
      skipped.push({ id: row.id, reason: "missingBeneficiary", nodeUrl });
      continue;
    }
    const beneficiary = normalizeHexAddress(String(beneficiaryRaw));

    const signature = String(row.signature ?? "");
    if (!isValidSignature(signature)) {
      summary.skipped.invalidSignature += 1;
      skipped.push({ id: row.id, reason: "invalidSignature", nodeUrl });
      continue;
    }

    let amount: bigint;
    let nonce: bigint;
    let deadline: bigint;
    try {
      amount = BigInt(row.amount);
    } catch {
      summary.skipped.invalidAmount += 1;
      skipped.push({ id: row.id, reason: "invalidAmount", nodeUrl });
      continue;
    }
    try {
      nonce = BigInt(row.nonce);
    } catch {
      summary.skipped.invalidNonce += 1;
      skipped.push({ id: row.id, reason: "invalidNonce", nodeUrl });
      continue;
    }
    try {
      deadline = BigInt(row.deadline);
    } catch {
      summary.skipped.invalidDeadline += 1;
      skipped.push({ id: row.id, reason: "invalidDeadline", nodeUrl });
      continue;
    }

    const rowPermit2 = row.permit2_address && isHexAddress(String(row.permit2_address)) ? normalizeHexAddress(String(row.permit2_address)) : null;
    const candidates = rowPermit2 ? uniqueAddresses([...permit2Candidates, rowPermit2]) : permit2Candidates;
    if (candidates.length === 0) {
      summary.skipped.missingPermit2 += 1;
      skipped.push({ id: row.id, reason: "missingPermit2", nodeUrl });
      continue;
    }

    const matches: Match[] = [];

    for (const token of tokenList) {
      const message = {
        permitted: {
          token: token.address,
          amount,
        },
        nonce,
        deadline,
        spender: beneficiary,
      } as const;

      for (const permit2Address of candidates) {
        try {
          const hash = hashTypedData({
            domain: { name: PERMIT2_DOMAIN_NAME, chainId: token.network, verifyingContract: permit2Address as `0x${string}` },
            types: PERMIT_TRANSFER_FROM_TYPES,
            primaryType: "PermitTransferFrom",
            message,
          });
          const signer = (await recoverAddress({ hash, signature: signature as `0x${string}` })).toLowerCase();
          const walletId = walletByAddress.get(signer);
          if (!walletId) continue;
          const partnerId = partnerByAddress.get(signer) ?? null;
          matches.push({
            tokenId: token.id,
            tokenAddress: token.address,
            networkId: token.network,
            permit2Address,
            signer,
            walletId,
            partnerId,
          });
        } catch {
          continue;
        }
      }
    }

    const uniqueMatches = new Map<string, Match>();
    for (const match of matches) {
      const key = `${match.signer}:${match.tokenId}:${match.permit2Address}`;
      if (!uniqueMatches.has(key)) uniqueMatches.set(key, match);
    }
    const deduped = Array.from(uniqueMatches.values());

    if (deduped.length === 0) {
      summary.skipped.noMatch += 1;
      skipped.push({ id: row.id, reason: "noMatch", nodeUrl });
      continue;
    }

    if (deduped.length > 1) {
      summary.skipped.ambiguousMatch += 1;
      skipped.push({ id: row.id, reason: "ambiguousMatch", nodeUrl, matches: deduped });
      continue;
    }

    const match = deduped[0];
    summary.matched += 1;

    let partnerId = match.partnerId;
    if (!partnerId) {
      if (!args.createPartners) {
        summary.skipped.missingPartner += 1;
        skipped.push({ id: row.id, reason: "missingPartner", nodeUrl, matches: [match] });
        continue;
      }
      const existing = createdPartnersByWallet.get(match.walletId);
      if (existing) {
        partnerId = existing;
      } else {
        const { data: inserted, error: insertError } = await supabase
          .from("partners")
          .insert({ wallet_id: match.walletId })
          .select("id")
          .single();
        if (insertError || !inserted?.id) {
          summary.skipped.updateFailed += 1;
          skipped.push({ id: row.id, reason: "partnerInsertFailed", nodeUrl });
          continue;
        }
        partnerId = Number(inserted.id);
        createdPartnersByWallet.set(match.walletId, partnerId);
        partnerByAddress.set(match.signer, partnerId);
      }
    }

    const updatePayload: Record<string, unknown> = {
      token_id: match.tokenId,
      network_id: match.networkId,
    };

    if (!row.permit2_address || normalizeHexAddress(String(row.permit2_address)) !== match.permit2Address) {
      updatePayload.permit2_address = match.permit2Address.toLowerCase();
    }
    if (row.partner_id !== partnerId) {
      updatePayload.partner_id = partnerId;
    }

    summary.updatesAttempted += 1;
    updates.push({ id: row.id, updatePayload, match, nodeUrl });
  }

  if (args.execute) {
    for (const update of updates) {
      const { error } = await supabase.from("permits").update(update.updatePayload).eq("id", update.id);
      if (error) {
        summary.skipped.updateFailed += 1;
      } else {
        summary.updatesApplied += 1;
      }
    }
  }

  const output = {
    summary,
    updates,
    skipped,
    createdPartners: Array.from(createdPartnersByWallet.entries()).map(([walletId, partnerId]) => ({ walletId, partnerId })),
  };

  if (args.out) {
    await Deno.writeTextFile(args.out, stringifyJson(output, args.pretty));
  }

  console.log(stringifyJson({ summary, out: args.out ?? null }, args.pretty));
};

await main();
