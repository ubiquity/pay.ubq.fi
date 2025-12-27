# RPC Provider E2E Test Handoff

This doc explains how to use the new Permit2 claim CLI to sign (and optionally broadcast) test claims against each upstream RPC provider.

## Goal

- Exercise RPC read paths (simulate, estimate, prepare) and write paths (send + receipt) against each upstream provider.
- Use fresh test permits per provider, since a permit can only be claimed once.

## Preconditions

- Repo: `lib/pay.ubq.fi`
- `.env` populated with:
  - `SUPABASE_URL` and `SUPABASE_ANON_KEY` (or `SUPABASE_SERVICE_ROLE_KEY`)
  - `INVALIDATOR_PRIVATE_KEY` (funding wallet for seeding test permits)
- `BENEFICIARY_PRIVATE_KEY` (beneficiary wallet for claims)
- Funding wallet has:
  - Sufficient token balance (default UUSD on Gnosis)
  - Permit2 allowance for the token (or claims will revert)

## Tools

- Seed permits: `bun run permit2:seed-test-permits`
- Claim permits: `bun run permit2:claim-test-permits`

Both use `RPC_URL` (or `VITE_RPC_URL`) as a base and append `/<chainId>`.

## Workflow (per upstream provider)

### 1) Seed fresh permits

```bash
RPC_URL="https://rpc.upstream.example" INVALIDATOR_PRIVATE_KEY=0x... \
  bun run permit2:seed-test-permits -- \
  --beneficiary 0x... \
  --count 5 \
  --execute \
  --node-url "https://rpc.upstream.example" \
  --pretty
```

Notes:

- `--node-url` tags the permits so you can trace which provider run created them.
- Default chain is Gnosis (100). Add `--chain-id <id>` for other chains.

### 2) Claim the permits

```bash
RPC_URL="https://rpc.upstream.example" BENEFICIARY_PRIVATE_KEY=0x... \
  bun run permit2:claim-test-permits -- \
  --beneficiary 0x... \
  --limit 5 \
  --batch \
  --execute \
  --pretty
```

Options:

- Omit `--execute` for sign-only (still uses RPC for simulate + prepare).
- Add `--no-wait` to skip receipt checks after send.
- Use `--permit-ids 123,124` if you want to target exact permits.

### 3) Validate

- Check the JSON output:
  - `transactions[].txHash` for broadcast runs
  - `transactions[].rawSignedTransaction` for sign-only runs
- Optional: write claim tx hashes to Supabase with:
  - `bun run permit2:backfill -- --owner 0x... --execute`

## Run Across All Upstreams

```bash
providers=(
  "https://rpc.upstream-a.example"
  "https://rpc.upstream-b.example"
  "https://rpc.upstream-c.example"
)

for base in "${providers[@]}"; do
  echo "Testing $base"
  RPC_URL="$base" INVALIDATOR_PRIVATE_KEY=0x... \
    bun run permit2:seed-test-permits -- --beneficiary 0x... --count 3 --execute --node-url "$base"

  RPC_URL="$base" BENEFICIARY_PRIVATE_KEY=0x... \
    bun run permit2:claim-test-permits -- --beneficiary 0x... --limit 3 --batch --execute --pretty
done
```

## Gotchas

- The claim CLI expects an RPC base URL that accepts `/<chainId>` (example: `https://rpc.ubq.fi/100`).
  - If a provider uses chain-specific URLs, use a base that supports the suffix or wrap it with a proxy.
- Each permit can be claimed once. Re-seed for each provider run.
- Claims fail if the funding wallet lacks balance or Permit2 allowance.
