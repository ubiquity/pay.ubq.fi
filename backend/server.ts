import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { createClient } from '@supabase/supabase-js';
import type { Context } from 'hono';

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

// Start server on port 8081 (changed from 8080 to avoid conflicts)
const port = 8081;

// Use the serve function from @hono/node-server
serve({
  fetch: app.fetch,
  port
}, info => {
  console.log(`Server running on port ${info.port}`);
});

export default app;
