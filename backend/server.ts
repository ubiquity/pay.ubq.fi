import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { createClient } from '@supabase/supabase-js';
import type { Context } from 'hono';
import process from "node:process";

type PermitClaim = {
  nonce: string;
  transactionHash: string;
  claimerAddress: string;
  txUrl: string;
};

const app = new Hono();


// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
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
app.use('/*', serveStatic({ root: '../frontend/dist' }));

// Production/Deno Deploy export
export default app;

// Development server (node.js only)
if (process.env.NODE_ENV === 'development') {
  const port = parseInt(process.env.PORT || '8080');
  serve({
    fetch: app.fetch,
    port
  }, info => {
    console.log(`Dev server running on port ${info.port}`);
  });
}
