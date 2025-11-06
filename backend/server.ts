import { createClient } from "npm:@supabase/supabase-js@2.39.8";
import type { Context } from "npm:hono@4.2.5";
import { Hono } from "npm:hono@4.2.5";
import { cors } from "npm:hono@4.2.5/cors";
import { serveStatic } from "npm:hono@4.2.5/deno";

const app = new Hono();

// CORS middleware
app.use("*", cors());

// Initialize Supabase client with Deno.env
const supabaseUrl = Deno.env.get("SUPABASE_URL");
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!supabaseUrl || !supabaseKey) {
  throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set");
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Health check endpoint
app.get("/health", (c: Context) => {  
  const environment = Deno.env.get("DENO_ENV") ||
    Deno.env.get("NODE_ENV") ||
    "production";

  return c.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    env: environment,
    deploy: "deno-deploy"
  });
});

// API endpoint for recording claims
app.post("/api/permits/record-claim", async (c: Context) => {
  try {
    const { signature, transactionHash } = await c.req.json();

    if (!signature || !transactionHash) {
      return c.json({ error: "Missing required fields" }, 400);
    }

    const { error } = await supabase
      .from("permits")
      .update({
        transaction: transactionHash,
      })
      .eq("signature", signature)
      .is("transaction", null);

    if (error) throw error;

    return c.json({ success: true });
  } catch (error) {
    console.error("Error recording claim:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return c.json({ error: "Failed to record claim", details: message }, 500);
  }
});

// Serve static files from frontend/dist
app.use("/*", serveStatic({ root: "./frontend/dist" }));

// SPA fallback - serve index.html for all non-API routes
app.get("*", serveStatic({ path: "./frontend/dist/index.html" }));

// Start server with Deno.serve
const port = parseInt(Deno.env.get("PORT") || "3000");
console.log(`Server running on port ${port}`);
console.log(`Environment: ${Deno.env.get("NODE_ENV") || "development"}`);

Deno.serve({ port }, app.fetch);