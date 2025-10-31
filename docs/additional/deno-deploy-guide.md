# Deno Deploy Configuration Guide

## Overview
This application runs fully Deno-native on Deno Deploy, using `Deno.serve` and native Deno APIs. No Node.js compatibility layer is required.

## Required Setup

### 1. Environment Variables
Set these in your Deno Deploy project dashboard:
- `SUPABASE_URL` - Your Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` - Supabase service role key with write permissions
- `NODE_ENV` - Set to "production" (optional, defaults to "development")
- `PORT` - Server port (optional, defaults to 3000)

### 2. Entry Point
- Configure the entry point as `backend/server.ts`
- The server is fully Deno-native using `Deno.serve` and `Deno.env`

### 3. Build Process
Before deployment, the frontend must be built:
```bash
cd frontend && bun run build
```
This creates the production build in `frontend/dist`

## Architecture

### Deno-Native Server
The backend uses:
- `Deno.serve` for HTTP server (no Node adapter)
- `Deno.env.get()` for environment variables (no `process.env`)
- `npm:` specifiers for npm packages (Hono, Supabase client)
- Native Deno static file serving via Hono's Deno adapter

### API Endpoints
- `GET /health` - Health check returning `{ status: "ok", timestamp, env }`
- `POST /api/permits/record-claim` - Records permit claim with signature and transaction hash

### Static Assets
- Frontend files served from `frontend/dist`
- SPA fallback: all non-API routes serve `index.html`
- Assets include `index.html` and `assets/` directory (JS, CSS, fonts, images)

## Deployment Steps

### Via GitHub Actions (Recommended)
1. Push to `development` or `fix/ci` branch
2. GitHub Actions automatically:
   - Installs dependencies
   - Builds frontend with Vite
   - Deploys to Deno Deploy via OIDC

### Manual Deployment
1. Ensure dependencies are installed:
   ```bash
   bun install
   ```

2. Build the frontend:
   ```bash
   cd frontend && bun run build
   ```

3. Deploy to Deno Deploy:
   ```bash
   deployctl deploy --project=pay-ubq-fi --entrypoint=backend/server.ts --prod
   ```

## Local Development

### Using Deno Tasks
```bash
# Development with auto-reload
deno task dev

# Production mode
deno task start
```

### Manual Run
```bash
deno run --allow-net --allow-read --allow-env backend/server.ts
```

### Environment Variables
Create a `.env` file in the project root (not tracked by git):
```env
SUPABASE_URL=your-supabase-url
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
NODE_ENV=development
PORT=3000
```

Load it with:
```bash
deno run --allow-net --allow-read --allow-env --env-file backend/server.ts
```

## File Structure
```
.
├── backend/
│   └── server.ts          # Deno-native server entry point
├── frontend/
│   ├── src/               # Frontend source
│   └── dist/              # Built static assets (generated)
├── deno.jsonc             # Deno configuration
└── .github/
    └── workflows/
        └── deploy.yml     # CI/CD pipeline
```

## Troubleshooting

### Build Fails
- Ensure Bun is installed: `bun --version`
- Verify Node.js compatibility (v18+ recommended)
- Check all dependencies are installed: `bun install`

### Static Files Not Loading
- Verify `frontend/dist` exists after build
- Check Deno Deploy environment variables are set
- Ensure `entrypoint` is set to `backend/server.ts`

### API Errors
- Verify `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in Deno Deploy
- Check Deno Deploy logs for error messages
- Test `/health` endpoint to verify server is running

### Common Errors
- **"SUPABASE_URL must be set"**: Environment variables not configured in Deno Deploy
- **404 on static files**: Frontend not built or `frontend/dist` missing
- **API timeout**: Check Supabase credentials and network connectivity

## Verification

After deployment, test these endpoints:
```bash
# Health check
curl https://pay-ubq-fi.deno.dev/health

# API endpoint (requires valid data)
curl -X POST https://pay-ubq-fi.deno.dev/api/permits/record-claim \
  -H "Content-Type: application/json" \
  -d '{"signature":"0x...","transactionHash":"0x..."}'
```

## Resources
- [Deno Deploy Documentation](https://deno.com/deploy/docs)
- [Hono Framework](https://hono.dev/)
- [Supabase JS Client](https://supabase.com/docs/reference/javascript/introduction)
