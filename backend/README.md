# Backend - Deno Native Server

This is the backend for pay.ubq.fi, running fully Deno-native on Deno Deploy.

## Architecture

### Deno-Native Stack
- **Runtime**: Deno (no Node.js compatibility layer)
- **HTTP Server**: `Deno.serve` (native Deno HTTP)
- **Framework**: Hono 4.2.5 (via npm:hono)
- **Environment**: `Deno.env.get()` for configuration
- **Database**: Supabase via `npm:@supabase/supabase-js`

### Key Features
- ✅ No `@hono/node-server` dependency
- ✅ No `process.env` usage
- ✅ Native Deno APIs only
- ✅ ESM imports with `npm:` specifiers
- ✅ Health check endpoint
- ✅ Static asset serving (SPA support)

## API Endpoints

### Health Check
```
GET /health
```
Returns server status:
```json
{
  "status": "ok",
  "timestamp": "2025-01-31T12:00:00.000Z",
  "env": "production"
}
```

### Record Permit Claim
```
POST /api/permits/record-claim
Content-Type: application/json

{
  "signature": "0x...",
  "transactionHash": "0x..."
}
```

Success response:
```json
{
  "success": true
}
```

Error response (400/500):
```json
{
  "error": "Failed to record claim",
  "details": "Error message"
}
```

## Configuration

### Environment Variables
Required:
- `SUPABASE_URL` - Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` - Service role key

Optional:
- `NODE_ENV` - Environment name (defaults to "development")
- `PORT` - Server port (defaults to 3000)

### deno.jsonc
The `deno.jsonc` file configures:
- **Tasks**: `dev`, `start`, `test`
- **Import Map**: npm package aliases
- **Compiler Options**: TypeScript strict mode
- **Lint/Format**: Code style rules

## Development

### Prerequisites
- Deno 1.x or later
- Environment variables (create `.env` file)

### Running Locally

Using Deno tasks (recommended):
```bash
deno task dev    # Development with auto-reload
deno task start  # Production mode
```

Manual run:
```bash
deno run --allow-net --allow-read --allow-env --env-file server.ts
```

### Testing Endpoints

Health check:
```bash
curl http://localhost:3000/health
```

Record claim:
```bash
curl -X POST http://localhost:3000/api/permits/record-claim \
  -H "Content-Type: application/json" \
  -d '{"signature":"0x123","transactionHash":"0xabc"}'
```

## Deployment

### Deno Deploy (Production)

#### Via GitHub Actions
Push to `development` or `fix/ci` branch triggers automatic deployment.

#### Manual Deploy
```bash
deployctl deploy --project=pay-ubq-fi --entrypoint=backend/server.ts --prod
```

### Pre-Deployment Checklist
1. ✅ Frontend built to `frontend/dist/`
2. ✅ Environment variables set in Deno Deploy dashboard
3. ✅ Entry point configured as `backend/server.ts`
4. ✅ OIDC permissions enabled for GitHub Actions

## Project Structure

```
backend/
├── server.ts           # Main server entry point (Deno-native)
└── package.json        # Legacy file (can be removed)

deno.jsonc              # Deno configuration
.env                    # Local environment variables (not committed)
```

## Migration Notes

### Changes from Node.js Version
1. **Server Bootstrap**:
   - ❌ Old: `import { serve } from "@hono/node-server"`
   - ✅ New: `Deno.serve({ port }, app.fetch)`

2. **Environment Variables**:
   - ❌ Old: `process.env.VARIABLE`
   - ✅ New: `Deno.env.get("VARIABLE")`

3. **Static Files**:
   - ❌ Old: `serveStatic` from `@hono/node-server/serve-static`
   - ✅ New: `serveStatic` from `hono/deno`

4. **Imports**:
   - ❌ Old: Direct npm imports
   - ✅ New: `npm:` specifiers (e.g., `npm:hono@4.2.5`)

### Removed Dependencies
- `@hono/node-server` - No longer needed
- Node.js-specific packages - Replaced with Deno APIs

### Added Features
- Health check endpoint at `/health`
- Improved error logging with context
- Native Deno static file serving
- Better SPA fallback handling

## Troubleshooting

### Common Issues

**"SUPABASE_URL must be set"**
- Solution: Set environment variables in Deno Deploy or `.env` file

**Static files not loading**
- Check `frontend/dist/` exists and contains built assets
- Verify server is serving from correct path

**Import errors**
- Ensure all npm imports use `npm:` prefix
- Check `deno.jsonc` import map

**Permission denied**
- Add required permissions to `deno run`: `--allow-net --allow-read --allow-env`

### Debugging

Check server logs:
```bash
# Local
deno task dev

# Production (Deno Deploy dashboard)
View logs in project > Deployments > [deployment] > Logs
```

Test with curl:
```bash
# Verbose mode
curl -v http://localhost:3000/health

# Follow redirects
curl -L http://localhost:3000/
```

## Resources

- [Deno Documentation](https://deno.land/manual)
- [Deno Deploy Guide](../docs/additional/deno-deploy-guide.md)
- [Hono Documentation](https://hono.dev/)
- [Supabase JS Client](https://supabase.com/docs/reference/javascript/introduction)

## License

See project root LICENSE file.
