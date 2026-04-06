#!/usr/bin/env -S deno run -A --ext=ts --env-file=.env

import { hashTypedData, recoverAddress } from "viem";
import {
  NEW_PERMIT2_ADDRESS,
  OLD_PERMIT2_ADDRESS,
  PERMIT2_DOMAIN_NAME,
  PERMIT_TRANSFER_FROM_TYPES,
  createSupabaseClientFromEnv,
  normalizeHexAddress,
} from "./permit2-tools.ts";

type CliArgs = {
  execute: boolean;
  maxUpdates: number;
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
  token_id: number | null;
  network_id: number | null;
  permit2_address?: string | null;
  created: string | null;
  location?: { node_url?: string | null } | null;
  users?: { wallets?: { address?: string | null } | null } | null;
};

const printUsage = () => {
  console.error(
    `
Usage:
  deno run -A --env-file=.env scripts/permit2-backfill-partners.ts [--execute] [--max-updates <n>] [--out <file>] [--pretty]

What it does:
  - Finds permits missing partner_id and attempts to recover the owner from the signature.
  - Matches the recovered owner to an existing partner wallet address.
  - Backfills partner_id (and, if missing, token_id/network_id/permit2_address).

Options:
      --execute      Write updates to Supabase (default: false; dry-run).
      --max-updates  Safety limit for number of permit rows to update (default: 500).
      --out          Write full report JSON to a file (otherwise prints summary only).
  -p, --pretty       Pretty-print JSON output.
  -h, --help         Show help.

Env:
  SUPABASE_URL or VITE_SUPABASE_URL
  SUPABASE_ANON_KEY or VITE_SUPABASE_ANON_KEY (fallback: SUPABASE_SERVICE_ROLE_KEY)
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

const REPO_REGEX = /github\.com\/([^/]+)\/([^/]+)/;

const extractRepo = (nodeUrl?: string | null) => {
  if (!nodeUrl) return null;
  const match = nodeUrl.match(REPO_REGEX);
  if (!match) return null;
  return `${match[1]}/${match[2]}`;
};

const normalizeAddress = (value?: string | null) => {
  if (!value) return null;
  try {
    return normalizeHexAddress(value);
  } catch {
    return null;
  }
};

const isValidSignature = (signature: string) => /^0x[0-9a-fA-F]+$/.test(signature) && (signature.length === 130 || signature.length === 132);

type TokenInfo = { id: number; address: string; network: number };
type Permit2Kind = "new" | "old";

type CandidateMatch = {
  tokenId: number;
  tokenAddress: string;
  networkId: number;
  permit2: Permit2Kind;
  owner: string;
  partnerId: number;
};

type CandidateRecovery = {
  tokenId: number;
  tokenAddress: string;
  networkId: number;
  permit2: Permit2Kind;
  owner: string;
  partnerId?: number;
};

type ReportUpdate = {
  id: number;
  created: string | null;
  repo: string | null;
  nodeUrl: string | null;
  partnerId: number;
  owner: string;
  tokenId: number;
  tokenAddress: string;
  networkId: number;
  permit2Address: string;
  updatePayload: Record<string, unknown>;
};

type ReportSkip = {
  id: number;
  created: string | null;
  repo: string | null;
  nodeUrl: string | null;
  reason: string;
  recoveries?: CandidateRecovery[];
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

  const { client: supabase } = createSupabaseClientFromEnv({ preferServiceRole: true });

  const tokenMap = new Map<number, TokenInfo>();
  const tokenList: TokenInfo[] = [];
  const { data: tokens, error: tokenError } = await supabase.from("tokens").select("id,address,network");
  if (tokenError) throw new Error(`Failed to load tokens: ${tokenError.message}`);
  for (const token of tokens ?? []) {
    if (!token.id || !token.address) continue;
    const network = Number(token.network ?? 0);
    if (!Number.isFinite(network) || network <= 0) continue;
    const info = { id: Number(token.id), address: String(token.address), network };
    tokenMap.set(info.id, info);
    tokenList.push(info);
  }
  const allTokenIds = tokenList.map((token) => token.id);

  const partnerByAddress = new Map<string, number>();
  const { data: partners, error: partnerError } = await supabase.from("partners").select("id, wallet:wallets(address)");
  if (partnerError) throw new Error(`Failed to load partners: ${partnerError.message}`);
  for (const partner of partners ?? []) {
    const address = normalizeAddress(partner.wallet?.address ?? null);
    if (!address || !partner.id) continue;
    partnerByAddress.set(address.toLowerCase(), Number(partner.id));
  }

  const repoTokenSets = new Map<string, Set<number>>();
  const repoPartnerSets = new Map<string, Set<number>>();

  const tokenRows = await pageThrough(async (offset, limit) => {
    const { data, error } = await supabase
      .from("permits")
      .select("token_id, location:locations(node_url)")
      .not("token_id", "is", null)
      .order("id", { ascending: true })
      .range(offset, offset + limit - 1);
    if (error) throw new Error(`Failed to load permits for token map: ${error.message}`);
    return (data ?? []) as { token_id: number | null; location?: { node_url?: string | null } | null }[];
  });

  for (const row of tokenRows) {
    const repo = extractRepo(row.location?.node_url ?? null);
    if (!repo || row.token_id == null) continue;
    const set = repoTokenSets.get(repo) ?? new Set<number>();
    set.add(Number(row.token_id));
    repoTokenSets.set(repo, set);
  }

  const partnerRows = await pageThrough(async (offset, limit) => {
    const { data, error } = await supabase
      .from("permits")
      .select("partner_id, location:locations(node_url)")
      .not("partner_id", "is", null)
      .order("id", { ascending: true })
      .range(offset, offset + limit - 1);
    if (error) throw new Error(`Failed to load permits for partner map: ${error.message}`);
    return (data ?? []) as { partner_id: number | null; location?: { node_url?: string | null } | null }[];
  });

  for (const row of partnerRows) {
    const repo = extractRepo(row.location?.node_url ?? null);
    if (!repo || row.partner_id == null) continue;
    const set = repoPartnerSets.get(repo) ?? new Set<number>();
    set.add(Number(row.partner_id));
    repoPartnerSets.set(repo, set);
  }

  const missingPartnerRows = await pageThrough(async (offset, limit) => {
    const { data, error } = await supabase
      .from("permits")
      .select(
        "id,amount,nonce,deadline,signature,token_id,network_id,permit2_address,created,location:locations(node_url),users!inner(wallets!inner(address))"
      )
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
  const tokenMatchCounts = new Map<number, number>();

  const summary = {
    total: missingPartnerRows.length,
    updatesAttempted: 0,
    updatesApplied: 0,
    tokenRecovered: 0,
    candidateSource: {
      explicitTokenId: 0,
      repoTokens: 0,
      allTokens: 0,
    },
    permit2Matches: {
      new: 0,
      old: 0,
    },
    skipped: {
      missingTokenCandidates: 0,
      missingBeneficiary: 0,
      invalidSignature: 0,
      invalidAmount: 0,
      invalidNonce: 0,
      invalidDeadline: 0,
      missingTokenInfo: 0,
      partnerNotFound: 0,
      ambiguousMatch: 0,
      repoPartnerMismatch: 0,
      updateFailed: 0,
      maxUpdatesReached: 0,
    },
    updatedIds: [] as number[],
  };

  for (const permit of missingPartnerRows) {
    if (summary.updatesAttempted >= args.maxUpdates) {
      summary.skipped.maxUpdatesReached += 1;
      break;
    }

    const repo = extractRepo(permit.location?.node_url ?? null);
    const nodeUrl = permit.location?.node_url ?? null;
    const permit2FromRow = normalizeAddress(permit.permit2_address ?? null);

    let permit2Kinds: Permit2Kind[] = ["new", "old"];
    if (permit2FromRow === NEW_PERMIT2_ADDRESS.toLowerCase()) {
      permit2Kinds = ["new"];
    } else if (permit2FromRow === OLD_PERMIT2_ADDRESS.toLowerCase()) {
      permit2Kinds = ["old"];
    }

    let candidateTokenIds: number[] = [];
    if (permit.token_id != null) {
      candidateTokenIds = [permit.token_id];
      summary.candidateSource.explicitTokenId += 1;
    } else {
      const repoTokens = repo ? repoTokenSets.get(repo) : null;
      if (repoTokens && repoTokens.size > 0) {
        candidateTokenIds = Array.from(repoTokens.values());
        summary.candidateSource.repoTokens += 1;
      } else {
        candidateTokenIds = allTokenIds.slice();
        summary.candidateSource.allTokens += 1;
      }
    }

    if (candidateTokenIds.length === 0) {
      summary.skipped.missingTokenCandidates += 1;
      if (includeDetails) {
        skipped.push({ id: permit.id, created: permit.created, repo, nodeUrl, reason: "missingTokenCandidates" });
      }
      continue;
    }

    const beneficiary = normalizeAddress(permit.users?.wallets?.address ?? null);
    if (!beneficiary) {
      summary.skipped.missingBeneficiary += 1;
      if (includeDetails) {
        skipped.push({ id: permit.id, created: permit.created, repo, nodeUrl, reason: "missingBeneficiary" });
      }
      continue;
    }

    const signature = String(permit.signature ?? "");
    if (!isValidSignature(signature)) {
      summary.skipped.invalidSignature += 1;
      if (includeDetails) {
        skipped.push({ id: permit.id, created: permit.created, repo, nodeUrl, reason: "invalidSignature" });
      }
      continue;
    }

    let amount: bigint;
    let nonce: bigint;
    let deadline: bigint;
    try {
      amount = BigInt(permit.amount);
    } catch {
      summary.skipped.invalidAmount += 1;
      if (includeDetails) {
        skipped.push({ id: permit.id, created: permit.created, repo, nodeUrl, reason: "invalidAmount" });
      }
      continue;
    }
    try {
      nonce = BigInt(permit.nonce);
    } catch {
      summary.skipped.invalidNonce += 1;
      if (includeDetails) {
        skipped.push({ id: permit.id, created: permit.created, repo, nodeUrl, reason: "invalidNonce" });
      }
      continue;
    }
    try {
      deadline = BigInt(permit.deadline);
    } catch {
      summary.skipped.invalidDeadline += 1;
      if (includeDetails) {
        skipped.push({ id: permit.id, created: permit.created, repo, nodeUrl, reason: "invalidDeadline" });
      }
      continue;
    }

    const validTokens: TokenInfo[] = [];
    for (const tokenId of candidateTokenIds) {
      const tokenInfo = tokenMap.get(tokenId);
      if (tokenInfo) validTokens.push(tokenInfo);
    }

    if (validTokens.length === 0) {
      summary.skipped.missingTokenInfo += 1;
      if (includeDetails) {
        skipped.push({ id: permit.id, created: permit.created, repo, nodeUrl, reason: "missingTokenInfo" });
      }
      continue;
    }

    const recoveries: CandidateRecovery[] = [];
    const matches: CandidateMatch[] = [];
    let repoMismatchHits = 0;

    for (const tokenInfo of validTokens) {
      const tokenAddress = normalizeHexAddress(tokenInfo.address);
      const message = {
        permitted: {
          token: tokenAddress,
          amount,
        },
        nonce,
        deadline,
        spender: beneficiary,
      } as const;

      for (const permit2Kind of permit2Kinds) {
        const verifyingContract = permit2Kind === "new" ? NEW_PERMIT2_ADDRESS : OLD_PERMIT2_ADDRESS;
        let signer: string | null = null;
        try {
          const hash = hashTypedData({
            domain: { name: PERMIT2_DOMAIN_NAME, chainId: tokenInfo.network, verifyingContract },
            types: PERMIT_TRANSFER_FROM_TYPES,
            primaryType: "PermitTransferFrom",
            message,
          });
          signer = (await recoverAddress({ hash, signature: signature as `0x${string}` })).toLowerCase();
        } catch {
          signer = null;
        }
        if (!signer) continue;

        const partnerId = partnerByAddress.get(signer);
        recoveries.push({
          tokenId: tokenInfo.id,
          tokenAddress,
          networkId: tokenInfo.network,
          permit2: permit2Kind,
          owner: signer,
          partnerId,
        });

        if (!partnerId) continue;
        if (repo) {
          const repoPartners = repoPartnerSets.get(repo);
          if (repoPartners && repoPartners.size > 0 && !repoPartners.has(partnerId)) {
            repoMismatchHits += 1;
            continue;
          }
        }
        matches.push({
          tokenId: tokenInfo.id,
          tokenAddress,
          networkId: tokenInfo.network,
          permit2: permit2Kind,
          owner: signer,
          partnerId,
        });
      }
    }

    const uniqueMatches = new Map<string, CandidateMatch>();
    for (const match of matches) {
      const key = `${match.partnerId}:${match.tokenId}:${match.permit2}`;
      if (!uniqueMatches.has(key)) uniqueMatches.set(key, match);
    }

    const dedupedMatches = Array.from(uniqueMatches.values());
    if (dedupedMatches.length === 0) {
      if (repoMismatchHits > 0) {
        summary.skipped.repoPartnerMismatch += 1;
        if (includeDetails) {
          skipped.push({ id: permit.id, created: permit.created, repo, nodeUrl, reason: "repoPartnerMismatch", recoveries });
        }
      } else {
        summary.skipped.partnerNotFound += 1;
        if (includeDetails) {
          skipped.push({ id: permit.id, created: permit.created, repo, nodeUrl, reason: "partnerNotFound", recoveries });
        }
      }
      continue;
    }

    if (dedupedMatches.length > 1) {
      summary.skipped.ambiguousMatch += 1;
      if (includeDetails) {
        skipped.push({ id: permit.id, created: permit.created, repo, nodeUrl, reason: "ambiguousMatch", recoveries });
      }
      continue;
    }

    const selected = dedupedMatches[0];
    const permit2Address = selected.permit2 === "new" ? NEW_PERMIT2_ADDRESS : OLD_PERMIT2_ADDRESS;
    const updatePayload: Record<string, unknown> = { partner_id: selected.partnerId };
    if (!permit.permit2_address && permit2Address) {
      updatePayload.permit2_address = permit2Address.toLowerCase();
    }
    if (permit.token_id == null) {
      updatePayload.token_id = selected.tokenId;
    }
    if (permit.network_id == null) {
      updatePayload.network_id = selected.networkId;
    }

    summary.updatesAttempted += 1;
    if (permit.token_id == null) summary.tokenRecovered += 1;
    summary.permit2Matches[selected.permit2] += 1;
    tokenMatchCounts.set(selected.tokenId, (tokenMatchCounts.get(selected.tokenId) ?? 0) + 1);

    if (includeDetails) {
      updates.push({
        id: permit.id,
        created: permit.created,
        repo,
        nodeUrl,
        partnerId: selected.partnerId,
        owner: selected.owner,
        tokenId: selected.tokenId,
        tokenAddress: selected.tokenAddress,
        networkId: selected.networkId,
        permit2Address: permit2Address.toLowerCase(),
        updatePayload,
      });
    }

    if (!args.execute) {
      summary.updatedIds.push(permit.id);
      continue;
    }

    const { error: updateError } = await supabase.from("permits").update(updatePayload).eq("id", permit.id);
    if (updateError) {
      summary.skipped.updateFailed += 1;
      if (includeDetails) {
        skipped.push({ id: permit.id, created: permit.created, repo, nodeUrl, reason: "updateFailed" });
      }
      continue;
    }
    summary.updatedIds.push(permit.id);
    summary.updatesApplied += 1;
  }

  const tokenMatches = tokenList.map((token) => ({
    tokenId: token.id,
    address: token.address,
    network: token.network,
    count: tokenMatchCounts.get(token.id) ?? 0,
  }));

  const output = {
    summary,
    tokenMatches,
    ...(includeDetails ? { updates, skipped } : {}),
  };

  if (args.out) {
    await Deno.writeTextFile(args.out, stringifyJson(output, args.pretty));
  }

  console.log(stringifyJson({ summary, tokenMatches, out: args.out ?? null }, args.pretty));
};

await main();
