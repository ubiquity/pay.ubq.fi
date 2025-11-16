import { createClient } from "@supabase/supabase-js";
import type { Context } from "hono";
import { Hono } from "hono";
import { serveStatic } from "hono/deno";

const app = new Hono();

const supabaseUrl = Deno.env.get("SUPABASE_URL");
const supabaseAnonKey = Deno.env.get("VITE_SUPABASE_ANON_KEY");
const rpcUrl = Deno.env.get("VITE_RPC_URL") || "https://rpc.ubq.fi";

const supabase = createClient(supabaseUrl!, supabaseAnonKey!);

// Health check
app.get("/health", (c: Context) => {
  const environment = Deno.env.get("DENO_ENV") ||
    Deno.env.get("NODE_ENV") ||
    "production";

  return c.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    env: environment,
    deploy: "production"
  });
});

app.get("/api/config", (c) => {
  return c.json({
    supabaseUrl: supabaseUrl,
    supabaseAnonKey: supabaseAnonKey,
  });
});

app.post("/api/permits/record-claim", async (c) => {
  try {
    const { signature, transactionHash } = await c.req.json();

    if (!signature || !transactionHash) {
      return c.json({ error: "Missing required fields" }, 400);
    }

    const { error } = await supabase
      .from("permits")
      .update({
        transaction: transactionHash,
        claimed_at: new Date().toISOString()
      })
      .eq("signature", signature)
      .is("transaction", null);

    if (error) throw error;

    return c.json({ success: true });
  } catch (error) {
    console.error("Error recording claim:", error);
    return c.json({ error: "Failed to record claim" }, 500);
  }
});

app.get("/api/permits/:signature", async (c) => {
  const signature = c.req.param("signature");

  const { data, error } = await supabase
    .from("permits")
    .select("*")
    .eq("signature", signature)
    .single();

  if (error || !data) {
    return c.json({ error: "Permit not found" }, 404);
  }

  return c.json({
    signature: data.signature,
    claimed: !!data.transaction,
    claimed_at: data.claimed_at
  });
});


app.post("/rpc/:chainId", async (c) => {
  try {
    const chainId = c.req.param("chainId");
    const body = await c.req.json();

    console.log(`Proxying RPC request for chain ${chainId} to ${rpcUrl}`, {
      isBatch: Array.isArray(body),
      batchSize: Array.isArray(body) ? body.length : 1
    });

    const response = await fetch(rpcUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`RPC request failed: ${response.status} ${errorText}`);

      if (Array.isArray(body)) {
        const errorResponses = body.map((req: any) => ({
          jsonrpc: "2.0",
          error: {
            code: -32000,
            message: `RPC request failed: ${response.status}`
          },
          id: req.id || null
        }));
        return c.json(errorResponses);
      } else {
        return c.json({
          jsonrpc: "2.0",
          error: {
            code: -32000,
            message: `RPC request failed: ${response.status}`
          },
          id: body.id || null
        });
      }
    }

    const data = await response.json();
    return c.json(data);

  } catch (error) {
    console.error("RPC proxy error:", error);

    const body = await c.req.json().catch(() => null);
    if (Array.isArray(body)) {
      const errorResponses = body.map((req: any) => ({
        jsonrpc: "2.0",
        error: {
          code: -32603,
          message: "Internal server error"
        },
        id: req.id || null
      }));
      return c.json(errorResponses);
    } else {
      return c.json({
        jsonrpc: "2.0",
        error: {
          code: -32603,
          message: "Internal server error"
        },
        id: body?.id || null
      });
    }
  }
});

app.use("/*", serveStatic({ root: "./frontend/dist" }));


app.get("*", async (c, next) => {
  const path = c.req.path;
  if (path.startsWith("/api/")) {
    return c.json({ error: "Not found" }, 404);
  }
  return serveStatic({ path: "./frontend/dist/index.html" })(c, next);
});

const port = parseInt(Deno.env.get("PORT") || "8000");
console.log(`🚀 Secure server running on port ${port}`);

Deno.serve({ port }, app.fetch);