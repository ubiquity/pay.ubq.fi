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
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY` (required for the claim API)
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `VITE_RPC_URL`

All frontend variables must be prefixed with `VITE_` to be exposed to the app.

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

## Contracts

Permit2 and PermitAggregator addresses used by the UI are in `src/constants/config.ts`.
