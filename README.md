# pay.ubq.fi

Permit claiming web app for Ubiquity Rewards.

- Frontend: React + TypeScript + Vite in `src/`.
- Server: `serve.ts` (Deno Deploy) serves the built SPA from `dist/` and exposes a small API to record permit claims in Supabase.

## Setup

1. Install dependencies:
   ```bash
   bun install
   ```
2. Create a `.env` file:
   ```bash
   cp .env.example .env
   ```
3. Fill in required variables (see `.env.example`):
   - Backend (`serve.ts`): `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
   - Frontend (Vite): `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
   - CI build convenience: `SUPABASE_ANON_KEY` is used to set `VITE_SUPABASE_ANON_KEY` in `.github/workflows/deno-deploy.yml`

All frontend variables must be prefixed with `VITE_` to be exposed to the app.
RPC uses `/rpc` only on `*.ubq.fi` hostnames; all other hostnames use `https://rpc.ubq.fi`.

## Development

- Two‑port dev with HMR:

  ```bash
  bun run dev
  ```

  - Vite runs on `http://localhost:5173`
  - `serve.ts` runs on `http://localhost:8000`
  - Vite proxies `/api/*` and top‑level numeric routes to `:8000`.

- Production‑like single‑port (no HMR):
  ```bash
  bun run start
  ```
  Builds the frontend and serves it + API on `http://localhost:8000`.

## Build

```bash
bun run build
```

Outputs static files to `dist/`.

## Deployment

Deployment is handled by GitHub Actions via `.github/workflows/deno-deploy.yml`.

- Builds `dist/` with Bun/Vite.
- Deploys `serve.ts` to Deno Deploy and includes `dist/**`.
- Required Deploy secrets: `DENO_DEPLOY_TOKEN`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.

## API

`serve.ts` exposes `POST /api/permits/record-claim` which accepts `{ "transactionHash": "0x...", "networkId": 100 }` and derives the permit signature(s) by decoding Permit2 calldata before updating Supabase.

Note: this endpoint uses `SUPABASE_SERVICE_ROLE_KEY` (bypasses RLS), so security comes from on-chain transaction verification before writing.

## CLI Tools

One-off tooling lives in `scripts/` (requires `.env` with Supabase + RPC vars).

- Audit permits against both Permit2 contracts (includes “nonce used but DB transaction missing” mismatches):
  - `bun run permit2:audit -- --owner 0x... --include-permits --out /tmp/permit2-audit.json`
- Build an invalidation plan (no transactions sent):
  - `bun run permit2:invalidate -- --owner 0x... --target old --only-db-unclaimed --out /tmp/permit2-invalidate-plan.json`
- Execute invalidations (sends transactions; use `--max-txs` as a safety brake):
  - `INVALIDATOR_PRIVATE_KEY=0x... bun run permit2:invalidate -- --owner 0x... --target old --only-db-unclaimed --execute --max-txs 50 --out /tmp/permit2-invalidate-executed.json`
- Backfill missing `permits.transaction` values for claim txs:
  - `bun run permit2:backfill -- --owner 0x... --out /tmp/permit2-backfill.json`
  - For a more complete one-off backfill on Gnosis, add `--match-mode beneficiary --scan-new-permit2-txlist`.
  - Add `--execute` to write to Supabase (use `--max-updates` as a safety brake).
- Seed small test permits for QA (default: 1e18 UUSD on Gnosis; plan-only unless `--execute`):
  - `INVALIDATOR_PRIVATE_KEY=0x... bun run permit2:seed-test-permits -- --beneficiary 0x... --beneficiary-user-id <githubUserId> --execute --out /tmp/test-permits.json`

## Formatting

`bun run format` / `bun run format:check` run Prettier across the repo (including `serve.ts`).

## Contracts

Permit2 and PermitAggregator addresses used by the UI are in `src/constants/config.ts`.
