import { Hono } from 'hono';
import { createClient } from '@supabase/supabase-js';
import type { Context } from 'hono';

type PermitClaim = {
  nonce: string;
  transactionHash: string;
  claimerAddress: string;
  txUrl: string;
};

const app = new Hono();


// Initialize Supabase client with environment validation
const requiredEnvVars = {
  SUPABASE_URL: process.env.SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY
};

// Validate each required environment variable
for (const [varName, value] of Object.entries(requiredEnvVars)) {
  if (!value) {
    throw new Error(`Missing required environment variable: ${varName}. Please check your .env file`);
  }
}

const supabase = createClient(
  requiredEnvVars.SUPABASE_URL,
  requiredEnvVars.SUPABASE_SERVICE_ROLE_KEY
);

// API endpoint for recording claims
app.post('/api/permits/record-claim', async (c: Context) => {
  try {
    const { nonce, transactionHash } = await c.req.json();

    if (!nonce || !transactionHash) {
      return c.json({ error: 'Missing required fields' }, 400);
    }

    const { error } = await supabase
      .from('permits')
      .update({
        transaction: transactionHash
        // The claimed_at column doesn't exist in the permits table
        // Using only the transaction column as requested
      })
      .eq('nonce', nonce);

    if (error) throw error;

    return c.json({ success: true });
  } catch (error) {
    console.error('Error recording claim:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return c.json({ error: 'Failed to record claim', details: message }, 500);
  }
});

// Serve static files in production
app.use('/*', async (c) => {
  try {
    const file = await Bun.file(`./frontend/dist${c.req.path}`).text();
    return new Response(file);
  } catch {
    return new Response('Not Found', { status: 404 });
  }
});

// Start server
const port = parseInt(process.env.PORT || '3000');
console.log(`Server running on port ${port}`);

Bun.serve({
  port,
  fetch: app.fetch
});
