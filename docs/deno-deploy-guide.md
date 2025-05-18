# Deno Deploy Configuration Guide

## Required Setup

1. **Environment Variables**:
   Set these in your Deno Deploy project dashboard:
   - `SUPABASE_URL` - Your Supabase project URL
   - `SUPABASE_SERVICE_ROLE_KEY` - Supabase service role key
   - `NODE_ENV` - Set to "production"

2. **Entry Point**:
   - Configure the entry point as `backend/server.ts`

3. **Build Process**:
   Before deployment:
   ```bash
   cd frontend && bun run build
   ```
   This creates the production build in `frontend/dist`

## Deployment Steps

1. Ensure all dependencies are installed:
   ```bash
   bun install
   ```

2. Build the frontend:
   ```bash
   cd frontend && bun run build
   ```

3. Deploy to Deno:
   - Link your repository to Deno Deploy
   - Set the entry point to `backend/server.ts`
   - Configure environment variables
   - Deploy!

## File Structure Requirements
Deno Deploy expects:
- Frontend files in `frontend/dist`
- Backend entry point at `backend/server.ts`
