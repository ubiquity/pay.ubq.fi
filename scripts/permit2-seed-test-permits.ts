#!/usr/bin/env -S deno run -A --ext=ts --env-file=.env

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import type { Database } from "../src/database.types.ts";
import {
  createSupabaseClientFromEnv,
  bitmapKey,
  fetchNonceBitmaps,
  getEnv,
  getRpcBaseUrlFromEnv,
  isHexAddress,
  isNonceUsed,
  NEW_PERMIT2_ADDRESS,
  noncePositions,
  normalizeHexAddress,
  OLD_PERMIT2_ADDRESS,
  PERMIT2_DOMAIN_NAME,
  PERMIT_TRANSFER_FROM_TYPES,
  type NonceBitmapRef,
  type NonceBitmapResult,
} from "./permit2-tools.ts";

type TargetPermit2 = "new" | "old";

type CliArgs = {
  owner?: string;
  beneficiary: string;
  beneficiaryUserId?: number;
  chainId: number;
  tokenAddress: string;
  amount: string;
  count: number;
  deadline: string;
  targetPermit2: TargetPermit2;
  privateKeyEnv: string;
  nodeUrl?: string;
  skipOnchainCheck: boolean;
  execute: boolean;
  out?: string;
  pretty: boolean;
  help: boolean;
};

const printUsage = () => {
  console.error(
    `
Usage:
  INVALIDATOR_PRIVATE_KEY=0x... bun run permit2:seed-test-permits -- --beneficiary 0x... [options]

What it does:
  - Ensures (wallets, partners, users, tokens) rows exist for an owner + beneficiary.
  - Signs Permit2 PermitTransferFrom typed data for the chosen Permit2 contract (default: NEW).
  - Inserts "test" permits into Supabase (default amount: 1e18 UUSD on Gnosis).

Required:
  -b, --beneficiary         Wallet that will claim (spender = msg.sender).

Options:
  -o, --owner               Optional: asserts the derived owner from --private-key-env matches this address.
      --beneficiary-user-id GitHub user id to use/create for the beneficiary (required only if no user is linked to the wallet).
      --chain-id            Network id / chain id (default: 100).
      --token-address       ERC20 token address (default: Gnosis UUSD 0xC6ed...2068).
      --amount              Amount in token base units (default: 0000000000000000001).
      --count               Number of permits to create (default: 1).
      --deadline            Permit deadline (unix seconds as a string; default: now + 30 days).
      --target-permit2      Which Permit2 contract to sign for: new | old (default: new).
      --private-key-env     Env var name holding the owner's private key (default: INVALIDATOR_PRIVATE_KEY).
      --node-url            Optional location.node_url to attach to all inserted permits (helps identify test rows in UI).
      --skip-onchain-check  Skip nonceBitmap checks (default: false).
      --execute             Actually insert rows into Supabase (default: false; plan-only).
      --out                 Write JSON report to a file (otherwise prints to stdout).
  -p, --pretty              Pretty-print JSON.
  -h, --help                Show help.

Env:
  SUPABASE_URL or VITE_SUPABASE_URL
  SUPABASE_SERVICE_ROLE_KEY (required; writes)
  RPC_URL or VITE_RPC_URL (optional, defaults to https://rpc.ubq.fi)

Signing env:
  INVALIDATOR_PRIVATE_KEY=0x... (or your chosen --private-key-env)
    `.trim()
  );
};

const parseArgs = (argv: string[]): CliArgs => {
  const out: Omit<CliArgs, "beneficiary"> = {
    chainId: 100,
    tokenAddress: "0xC6ed4f520f6A4e4DC27273509239b7F8A68d2068",
    amount: "0000000000000000001",
    count: 1,
    deadline: "",
    targetPermit2: "new",
    privateKeyEnv: "INVALIDATOR_PRIVATE_KEY",
    skipOnchainCheck: false,
    execute: false,
    pretty: false,
    help: false,
  };

  let owner: string | undefined;
  let beneficiary: string | undefined;

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
    if (arg === "--skip-onchain-check") {
      out.skipOnchainCheck = true;
      continue;
    }
    if (arg === "--owner" || arg === "-o") {
      owner = takeValue(arg, argv[i + 1]);
      i += 1;
      continue;
    }
    if (arg.startsWith("--owner=")) {
      owner = arg.slice("--owner=".length);
      continue;
    }
    if (arg === "--beneficiary" || arg === "-b") {
      beneficiary = takeValue(arg, argv[i + 1]);
      i += 1;
      continue;
    }
    if (arg.startsWith("--beneficiary=")) {
      beneficiary = arg.slice("--beneficiary=".length);
      continue;
    }
    if (arg === "--beneficiary-user-id") {
      const v = Number(takeValue(arg, argv[i + 1]));
      i += 1;
      if (!Number.isFinite(v) || v <= 0) throw new Error(`Invalid --beneficiary-user-id: ${argv[i]}`);
      out.beneficiaryUserId = Math.floor(v);
      continue;
    }
    if (arg.startsWith("--beneficiary-user-id=")) {
      const v = Number(arg.slice("--beneficiary-user-id=".length));
      if (!Number.isFinite(v) || v <= 0) throw new Error(`Invalid --beneficiary-user-id: ${v}`);
      out.beneficiaryUserId = Math.floor(v);
      continue;
    }
    if (arg === "--chain-id") {
      const v = Number(takeValue(arg, argv[i + 1]));
      i += 1;
      if (!Number.isFinite(v) || v <= 0) throw new Error(`Invalid --chain-id: ${argv[i]}`);
      out.chainId = Math.floor(v);
      continue;
    }
    if (arg.startsWith("--chain-id=")) {
      const v = Number(arg.slice("--chain-id=".length));
      if (!Number.isFinite(v) || v <= 0) throw new Error(`Invalid --chain-id: ${v}`);
      out.chainId = Math.floor(v);
      continue;
    }
    if (arg === "--token-address") {
      out.tokenAddress = takeValue(arg, argv[i + 1]);
      i += 1;
      continue;
    }
    if (arg.startsWith("--token-address=")) {
      out.tokenAddress = arg.slice("--token-address=".length);
      continue;
    }
    if (arg === "--amount") {
      out.amount = takeValue(arg, argv[i + 1]);
      i += 1;
      continue;
    }
    if (arg.startsWith("--amount=")) {
      out.amount = arg.slice("--amount=".length);
      continue;
    }
    if (arg === "--count") {
      const v = Number(takeValue(arg, argv[i + 1]));
      i += 1;
      if (!Number.isFinite(v) || v <= 0) throw new Error(`Invalid --count: ${argv[i]}`);
      out.count = Math.floor(v);
      continue;
    }
    if (arg.startsWith("--count=")) {
      const v = Number(arg.slice("--count=".length));
      if (!Number.isFinite(v) || v <= 0) throw new Error(`Invalid --count: ${v}`);
      out.count = Math.floor(v);
      continue;
    }
    if (arg === "--deadline") {
      out.deadline = takeValue(arg, argv[i + 1]);
      i += 1;
      continue;
    }
    if (arg.startsWith("--deadline=")) {
      out.deadline = arg.slice("--deadline=".length);
      continue;
    }
    if (arg === "--target-permit2") {
      const v = takeValue(arg, argv[i + 1]);
      i += 1;
      if (v !== "new" && v !== "old") throw new Error(`Invalid --target-permit2: ${v}`);
      out.targetPermit2 = v;
      continue;
    }
    if (arg.startsWith("--target-permit2=")) {
      const v = arg.slice("--target-permit2=".length);
      if (v !== "new" && v !== "old") throw new Error(`Invalid --target-permit2: ${v}`);
      out.targetPermit2 = v;
      continue;
    }
    if (arg === "--private-key-env") {
      out.privateKeyEnv = takeValue(arg, argv[i + 1]);
      i += 1;
      continue;
    }
    if (arg.startsWith("--private-key-env=")) {
      out.privateKeyEnv = arg.slice("--private-key-env=".length);
      continue;
    }
    if (arg === "--node-url") {
      out.nodeUrl = takeValue(arg, argv[i + 1]);
      i += 1;
      continue;
    }
    if (arg.startsWith("--node-url=")) {
      out.nodeUrl = arg.slice("--node-url=".length);
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

  if (!beneficiary) {
    if (out.help) {
      return { ...out, owner, beneficiary: "0x0000000000000000000000000000000000000000" };
    }
    throw new Error("Missing --beneficiary");
  }

  return { ...out, owner, beneficiary };
};

const stringifyJson = (value: unknown, pretty: boolean) =>
  JSON.stringify(
    value,
    (_key, v) => {
      if (typeof v === "bigint") return v.toString();
      return v;
    },
    pretty ? 2 : undefined
  );

const isPrivateKey = (value: string) => /^0x[0-9a-fA-F]{64}$/.test(value.trim());

const MAX_NONCE_ATTEMPTS = 25;

const randomNonce = (): bigint => {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return bytes.reduce((acc, b) => (acc << 8n) + BigInt(b), 0n);
};

async function getOrCreateWallet({
  supabase,
  address,
}: {
  supabase: SupabaseClient<Database>;
  address: `0x${string}`;
}): Promise<{ id: number; address: string | null }> {
  const normalized = address.toLowerCase();
  const { data: existing, error } = await supabase.from("wallets").select("id, address").ilike("address", normalized).limit(1);
  if (error) throw new Error(error.message);
  if (existing && existing.length > 0) return { id: existing[0].id, address: existing[0].address };

  const { data: inserted, error: insertError } = await supabase.from("wallets").insert({ address: normalized }).select("id, address").limit(1);
  if (insertError) throw new Error(insertError.message);
  if (!inserted || inserted.length === 0) throw new Error("Wallet insert returned no rows");
  return { id: inserted[0].id, address: inserted[0].address };
}

async function getOrCreatePartner({
  supabase,
  walletId,
}: {
  supabase: SupabaseClient<Database>;
  walletId: number;
}): Promise<{ id: number; wallet_id: number | null }> {
  const { data: existing, error } = await supabase.from("partners").select("id, wallet_id").eq("wallet_id", walletId).limit(1);
  if (error) throw new Error(error.message);
  if (existing && existing.length > 0) return { id: existing[0].id, wallet_id: existing[0].wallet_id };

  const { data: inserted, error: insertError } = await supabase.from("partners").insert({ wallet_id: walletId }).select("id, wallet_id").limit(1);
  if (insertError) throw new Error(insertError.message);
  if (!inserted || inserted.length === 0) throw new Error("Partner insert returned no rows");
  return { id: inserted[0].id, wallet_id: inserted[0].wallet_id };
}

async function getOrCreateToken({
  supabase,
  chainId,
  tokenAddress,
}: {
  supabase: SupabaseClient<Database>;
  chainId: number;
  tokenAddress: `0x${string}`;
}): Promise<{ id: number; address: string; network: number }> {
  const normalized = tokenAddress.toLowerCase();
  const { data: existing, error } = await supabase.from("tokens").select("id, address, network").eq("network", chainId).ilike("address", normalized).limit(1);
  if (error) throw new Error(error.message);
  if (existing && existing.length > 0) return { id: existing[0].id, address: existing[0].address, network: existing[0].network };

  const { data: inserted, error: insertError } = await supabase
    .from("tokens")
    .insert({ network: chainId, address: normalized })
    .select("id, address, network")
    .limit(1);
  if (insertError) throw new Error(insertError.message);
  if (!inserted || inserted.length === 0) throw new Error("Token insert returned no rows");
  return { id: inserted[0].id, address: inserted[0].address, network: inserted[0].network };
}

async function getOrCreateLocation({
  supabase,
  nodeUrl,
}: {
  supabase: SupabaseClient<Database>;
  nodeUrl: string;
}): Promise<{ id: number; node_url: string | null }> {
  const trimmed = nodeUrl.trim();
  if (!trimmed) throw new Error("Invalid --node-url (empty)");

  const { data: inserted, error } = await supabase.from("locations").insert({ node_url: trimmed }).select("id, node_url").limit(1);
  if (error) throw new Error(error.message);
  if (!inserted || inserted.length === 0) throw new Error("Location insert returned no rows");
  return { id: inserted[0].id, node_url: inserted[0].node_url };
}

async function getOrCreateUserForWallet({
  supabase,
  walletId,
  userId,
}: {
  supabase: SupabaseClient<Database>;
  walletId: number;
  userId?: number;
}): Promise<{ id: number; wallet_id: number | null }> {
  const { data: existing, error } = await supabase.from("users").select("id, wallet_id").eq("wallet_id", walletId).limit(1);
  if (error) throw new Error(error.message);
  if (existing && existing.length > 0) return { id: existing[0].id, wallet_id: existing[0].wallet_id };

  if (!userId) {
    throw new Error("No users row is linked to the beneficiary wallet. Re-run with --beneficiary-user-id <githubUserId> to create/link one.");
  }

  const { data: existingById, error: byIdError } = await supabase.from("users").select("id, wallet_id").eq("id", userId).limit(1);
  if (byIdError) throw new Error(byIdError.message);
  if (existingById && existingById.length > 0) {
    const row = existingById[0];
    if (row.wallet_id === walletId) return { id: row.id, wallet_id: row.wallet_id };
    if (row.wallet_id === null) {
      const { data: updated, error: updateError } = await supabase
        .from("users")
        .update({ wallet_id: walletId })
        .eq("id", userId)
        .select("id, wallet_id")
        .limit(1);
      if (updateError) throw new Error(updateError.message);
      if (!updated || updated.length === 0) throw new Error("User update returned no rows");
      return { id: updated[0].id, wallet_id: updated[0].wallet_id };
    }
    throw new Error(`users.id=${userId} is already linked to a different wallet_id=${row.wallet_id}`);
  }

  const { data: inserted, error: insertError } = await supabase.from("users").insert({ id: userId, wallet_id: walletId }).select("id, wallet_id").limit(1);
  if (insertError) throw new Error(insertError.message);
  if (!inserted || inserted.length === 0) throw new Error("User insert returned no rows");
  return { id: inserted[0].id, wallet_id: inserted[0].wallet_id };
}

async function collectNonces({
  rpcBaseUrl,
  chainId,
  permit2Address,
  owner,
  count,
  skipOnchainCheck,
}: {
  rpcBaseUrl: string;
  chainId: number;
  permit2Address: `0x${string}`;
  owner: `0x${string}`;
  count: number;
  skipOnchainCheck: boolean;
}): Promise<{ nonces: bigint[]; errors: { nonce: string; error: string }[] }> {
  if (count <= 0) return { nonces: [], errors: [] };

  if (skipOnchainCheck) {
    const nonces: bigint[] = [];
    const errors: { nonce: string; error: string }[] = [];

    for (let i = 0; i < count; i += 1) {
      let nonce: bigint | null = null;
      for (let attempt = 0; attempt < MAX_NONCE_ATTEMPTS; attempt += 1) {
        const candidate = randomNonce();
        if (candidate === 0n) continue;
        nonce = candidate;
        break;
      }
      if (nonce === null) {
        errors.push({ nonce: "", error: "Failed to find an unused nonce (attempt limit reached)" });
        continue;
      }
      nonces.push(nonce);
    }

    return { nonces, errors };
  }

  const assigned: Array<bigint | null> = Array.from({ length: count }, () => null);
  const lastErrors: Array<string | null> = Array.from({ length: count }, () => null);
  let pending = Array.from({ length: count }, (_value, index) => index);

  for (let attempt = 0; attempt < MAX_NONCE_ATTEMPTS && pending.length > 0; attempt += 1) {
    const candidatesByIndex = new Map<number, { nonce: bigint; bitPos: bigint; key: string }>();
    const refsByKey = new Map<string, NonceBitmapRef>();

    for (const index of pending) {
      const nonce = randomNonce();
      if (nonce === 0n) continue;
      const { wordPos, bitPos } = noncePositions(nonce);
      const ref: NonceBitmapRef = { chainId, permit2Address, owner, wordPos };
      const key = bitmapKey(ref);
      candidatesByIndex.set(index, { nonce, bitPos, key });
      if (!refsByKey.has(key)) refsByKey.set(key, ref);
    }

    const bitmaps: Map<string, NonceBitmapResult> =
      refsByKey.size > 0
        ? await fetchNonceBitmaps({ rpcBaseUrl, refs: Array.from(refsByKey.values()) })
        : new Map<string, NonceBitmapResult>();

    const nextPending: number[] = [];

    for (const index of pending) {
      const candidate = candidatesByIndex.get(index);
      if (!candidate) {
        nextPending.push(index);
        continue;
      }
      const res = bitmaps.get(candidate.key);
      if (!res) {
        lastErrors[index] = "Missing nonceBitmap response";
        nextPending.push(index);
        continue;
      }
      if ("error" in res) {
        lastErrors[index] = res.error;
        nextPending.push(index);
        continue;
      }
      if (isNonceUsed({ bitmap: res.bitmap, bitPos: candidate.bitPos })) {
        lastErrors[index] = "Nonce already used (nonceBitmap bit is set)";
        nextPending.push(index);
        continue;
      }
      assigned[index] = candidate.nonce;
    }

    pending = nextPending;
  }

  const errors: { nonce: string; error: string }[] = [];
  for (const index of pending) {
    errors.push({ nonce: "", error: lastErrors[index] ?? "Failed to find an unused nonce (attempt limit reached)" });
  }

  const nonces = assigned.filter((nonce): nonce is bigint => nonce !== null);
  return { nonces, errors };
}

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

  if (!isHexAddress(args.beneficiary)) {
    console.error("Invalid --beneficiary (expected 0x + 40 hex chars).");
    Deno.exit(1);
    return;
  }
  if (!isHexAddress(args.tokenAddress)) {
    console.error("Invalid --token-address (expected 0x + 40 hex chars).");
    Deno.exit(1);
    return;
  }

  const beneficiary = normalizeHexAddress(args.beneficiary);
  const tokenAddress = normalizeHexAddress(args.tokenAddress);

  let amount: bigint;
  try {
    amount = BigInt(args.amount);
  } catch {
    console.error("Invalid --amount (expected bigint-like string, e.g. 0000000000000000001).");
    Deno.exit(1);
    return;
  }
  if (amount <= 0n) {
    console.error("Invalid --amount (must be > 0).");
    Deno.exit(1);
    return;
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  const defaultDeadline = (nowSeconds + 60 * 60 * 24 * 30).toString();
  const deadlineStr = args.deadline?.trim() ? args.deadline.trim() : defaultDeadline;
  let deadline: bigint;
  try {
    deadline = BigInt(deadlineStr);
  } catch {
    console.error("Invalid --deadline (expected unix seconds as a string).");
    Deno.exit(1);
    return;
  }
  if (deadline <= BigInt(nowSeconds)) {
    console.error("Invalid --deadline (must be in the future).");
    Deno.exit(1);
    return;
  }

  const privateKeyEnvName = args.privateKeyEnv || "INVALIDATOR_PRIVATE_KEY";
  const envKey = getEnv(privateKeyEnvName);
  const privateKey = (envKey ?? "").trim();
  if (!isPrivateKey(privateKey)) {
    console.error(`Missing/invalid private key in env var ${privateKeyEnvName} (expected 0x + 64 hex chars).`);
    Deno.exit(1);
    return;
  }

  const account = privateKeyToAccount(privateKey as Hex);

  const derivedOwner = normalizeHexAddress(account.address);
  if (args.owner) {
    if (!isHexAddress(args.owner)) {
      console.error("Invalid --owner (expected 0x + 40 hex chars).");
      Deno.exit(1);
      return;
    }
    const provided = normalizeHexAddress(args.owner);
    if (provided.toLowerCase() !== derivedOwner.toLowerCase()) {
      console.error("--owner does not match the derived address from the provided private key.");
      console.error(`  --owner: ${provided}`);
      console.error(`  key->address: ${derivedOwner}`);
      Deno.exit(1);
      return;
    }
  }

  const owner = derivedOwner;

  const permit2Address = (args.targetPermit2 === "new" ? NEW_PERMIT2_ADDRESS : OLD_PERMIT2_ADDRESS) as `0x${string}`;
  const rpcBaseUrl = getRpcBaseUrlFromEnv();

  const { client: supabase, usesServiceRole, url: supabaseUrl } = createSupabaseClientFromEnv({ preferServiceRole: true });
  if (!usesServiceRole) {
    console.error("Supabase client is not using SUPABASE_SERVICE_ROLE_KEY; refusing to write.");
    console.error("Set SUPABASE_SERVICE_ROLE_KEY in .env (or export it) and re-run.");
    Deno.exit(1);
    return;
  }

  const [ownerWallet, beneficiaryWallet] = await Promise.all([
    getOrCreateWallet({ supabase, address: owner }),
    getOrCreateWallet({ supabase, address: beneficiary }),
  ]);

  const [partner, token] = await Promise.all([
    getOrCreatePartner({ supabase, walletId: ownerWallet.id }),
    getOrCreateToken({ supabase, chainId: args.chainId, tokenAddress }),
  ]);

  const user = await getOrCreateUserForWallet({ supabase, walletId: beneficiaryWallet.id, userId: args.beneficiaryUserId });

  const location = args.nodeUrl ? await getOrCreateLocation({ supabase, nodeUrl: args.nodeUrl }) : null;

  const { nonces, errors: usedNonceErrors } = await collectNonces({
    rpcBaseUrl,
    chainId: args.chainId,
    permit2Address,
    owner,
    count: args.count,
    skipOnchainCheck: args.skipOnchainCheck,
  });

  const permits: { nonce: string; signature: string }[] = [];

  for (const nonce of nonces) {
    const signature = await account.signTypedData({
      domain: { name: PERMIT2_DOMAIN_NAME, chainId: args.chainId, verifyingContract: permit2Address },
      types: PERMIT_TRANSFER_FROM_TYPES,
      primaryType: "PermitTransferFrom",
      message: {
        permitted: { token: tokenAddress, amount },
        spender: beneficiary,
        nonce,
        deadline,
      },
    });

    permits.push({ nonce: nonce.toString(), signature });
  }

  const insertRows = permits.map((p) => ({
    amount: amount.toString(),
    nonce: p.nonce,
    deadline: deadline.toString(),
    signature: p.signature,
    beneficiary_id: user.id,
    partner_id: partner.id,
    token_id: token.id,
    location_id: location?.id ?? null,
    transaction: null,
  }));

  const reportBase = {
    supabaseUrl,
    owner,
    beneficiary,
    beneficiaryUserId: user.id,
    partnerId: partner.id,
    tokenId: token.id,
    chainId: args.chainId,
    tokenAddress,
    amount: amount.toString(),
    deadline: deadline.toString(),
    targetPermit2: args.targetPermit2,
    permit2Address,
    nodeUrl: location?.node_url ?? null,
    skipOnchainCheck: args.skipOnchainCheck,
    planned: insertRows.length,
    failedNonceChecks: usedNonceErrors,
  };

  if (!args.execute) {
    const out = stringifyJson({ ...reportBase, inserted: 0, permits }, args.pretty);
    if (args.out) await Deno.writeTextFile(args.out, out);
    else console.log(out);
    return;
  }

  const { data: inserted, error: insertError } = await supabase.from("permits").insert(insertRows).select("id, nonce, signature, created");
  if (insertError) throw new Error(insertError.message);

  const insertedPermits = (inserted ?? []).map((row) => ({
    id: row.id,
    nonce: String(row.nonce),
    signature: String(row.signature),
    created: row.created,
  }));

  const out = stringifyJson({ ...reportBase, inserted: insertedPermits.length, permits: insertedPermits }, args.pretty);
  if (args.out) await Deno.writeTextFile(args.out, out);
  else console.log(out);
};

await main();
