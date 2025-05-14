/// <reference types="https://deno.land/x/deno/cli/types/dts/index.d.ts" />

import { serve } from "https://deno.land/std@0.180.0/http/server.ts";
import { serveDir } from "https://deno.land/std@0.180.0/http/file_server.ts";
import { join } from "https://deno.land/std@0.180.0/path/mod.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const PORT = 8000;
const STATIC_DIR = "dist";

// Initialize Supabase client
const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

serve(async (req: Request) => {
  const url = new URL(req.url);
  const pathname = url.pathname;

  // API endpoint for recording claims
  if (pathname === '/api/permits/record-claim' && req.method === 'POST') {
    try {
      const { nonce, transactionHash, claimerAddress } = await req.json();

      // Validate input
      if (!nonce || !transactionHash || !claimerAddress) {
        return new Response(JSON.stringify({ error: 'Missing required fields' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // Update permit record in Supabase
      const { error } = await supabase
        .from('permits')
        .update({
          transaction_hash: transactionHash,
          claimed_at: new Date().toISOString(),
          claimer_address: claimerAddress
        })
        .eq('nonce', nonce);

      if (error) {
        throw error;
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { 'Content-Type': 'application/json' }
      });

    } catch (error: unknown) {
      console.error('Error recording claim:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return new Response(JSON.stringify({
        error: 'Failed to record claim',
        details: errorMessage
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }

  // Serve static files
  try {
    const response = await serveDir(req, {
      fsRoot: STATIC_DIR,
      urlRoot: "",
      showDirListing: false,
      quiet: true,
    });

    if (response.status !== 404) {
      return response;
    }
  } catch (e) {
    console.error("Error serving static file:", e);
  }

  // SPA fallback
  const indexPath = join(STATIC_DIR, "index.html");
  try {
    const indexContent = await Deno.readFile(indexPath);
    return new Response(indexContent, {
      headers: { "Content-Type": "text/html" },
    });
  } catch (e) {
    console.error(`Error reading index.html:`, e);
    return new Response("Not Found", { status: 404 });
  }
}, { port: PORT });
