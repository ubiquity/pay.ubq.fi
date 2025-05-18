import { Hono } from 'hono';

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
    const { nonce, transactionHash, claimerAddress, txUrl } = await c.req.json<PermitClaim>();

    if (!nonce || !transactionHash || !claimerAddress || !txUrl) {
      return c.json({ error: 'Missing required fields' }, 400);
    }

    const { error } = await supabase
      .from('discovered_permits')
      .update({
        transaction_hash: transactionHash,
        claimed_at: new Date().toISOString(),
        claimer_address: claimerAddress,
        tx_url: txUrl
      })
      .eq('permit_nonce', nonce);

    if (error) throw error;

    return c.json({ success: true });
  } catch (error) {
    console.error('Error recording claim:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return c.json({ error: 'Failed to record claim', details: message }, 500);
  }
});

// Serve static files in production
app.use('/*', serveStatic({ root: 'dist' }));

export default app;
