import { createClient } from "@supabase/supabase-js";
import type { Context } from "hono";
import { Hono } from "hono";
import { serveStatic } from "hono/deno";

const app = new Hono();

const supabaseUrl = Deno.env.get("SUPABASE_URL");
const supabaseAnonKey = Deno.env.get("VITE_SUPABASE_ANON_KEY");

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


app.use("/*", serveStatic({ root: "./frontend/dist" }));


app.get("*", (c) => {
  const path = c.req.path;
  if (path.startsWith("/api/")) {
    return c.json({ error: "Not found" }, 404);
  }
  return serveStatic({ path: "./frontend/dist/index.html" })(c);
});

const port = parseInt(Deno.env.get("PORT") || "3000");
console.log(`🚀 Secure server running on port ${port}`);

Deno.serve({ port }, app.fetch);