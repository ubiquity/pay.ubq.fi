import { serveDir, serveFile } from "jsr:@std/http/file-server";
import { createClient } from "npm:@supabase/supabase-js@2.56.0";
import type { Database } from "./src/database.types.ts";

// Default to the built frontend output so we don't 404 if STATIC_DIR is missing.
const root = Deno.env.get("STATIC_DIR") ?? "dist";

const supabaseUrl = Deno.env.get("SUPABASE_URL");
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!supabaseUrl || !supabaseKey) {
  console.warn("[serve] Supabase env missing; permit claim API disabled.");
}

const supabase = supabaseUrl && supabaseKey ? createClient<Database>(supabaseUrl, supabaseKey) : null;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS,HEAD",
  "Access-Control-Allow-Headers": "Content-Type",
};

const withCors = (response: Response) => {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(corsHeaders)) {
    headers.set(key, value);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
};

const port = parseInt(Deno.env.get("PORT") ?? "8000", 10);

Deno.serve({ port }, async (req) => {
  const url = new URL(req.url);
  const path = url.pathname;

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method === "POST" && path === "/api/permits/record-claim") {
    if (!supabase) {
      return new Response(JSON.stringify({ error: "Supabase not configured" }), {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    try {
      const { signature, transactionHash } = await req.json();

      if (!signature || !transactionHash) {
        return new Response(JSON.stringify({ error: "Missing required fields" }), {
          status: 400,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      const { data, error } = await supabase
        .from("permits")
        .update({
          transaction: transactionHash,
        })
        .eq("signature", signature)
        .is("transaction", null)
        .select("id");

      if (error) throw error;

      const updated = data?.length ?? 0;

      if (!updated) {
        return new Response(JSON.stringify({ success: false, error: "Permit not found or already claimed", updated: 0 }), {
          status: 404,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      return new Response(JSON.stringify({ success: true, updated }), {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    } catch (error) {
      console.error("Error recording claim:", error);
      const message = error instanceof Error ? error.message : "Unknown error";
      return new Response(JSON.stringify({ error: "Failed to record claim", details: message }), {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }
  }

  const isHead = req.method === "HEAD";
  const request = isHead ? new Request(req.url, { method: "GET", headers: req.headers }) : req;

  // Try to serve the file directly (HEAD is coerced to GET to avoid 405s on probes)
  let response = await serveDir(request, { fsRoot: root, quiet: true });

  // If it's a 404 and not a file request, serve index.html for SPA routing
  if (response.status === 404 && !path.includes(".")) {
    response = await serveFile(request, `${root}/index.html`);
  }

  response = withCors(response);

  if (isHead) {
    return new Response(null, { status: response.status, headers: response.headers });
  }

  return response;
});
