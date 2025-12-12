import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { createClient } from "@supabase/supabase-js";
import type { Context } from "hono";
import { Hono } from "hono";
import { cors } from "hono/cors";
import process from "node:process";
import type { Database } from "../frontend/src/database.types.ts";

const app = new Hono();
app.use("*", cors());

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set");
}

const supabase = createClient<Database>(supabaseUrl, supabaseKey);

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

// Serve static files for the frontend (skip in dev if dist is missing)
const staticRoot = resolve("./src/frontend/dist");
if (existsSync(staticRoot)) {
  app.use("/*", serveStatic({ root: staticRoot }));
  app.use("/*", serveStatic({ path: `${staticRoot}/index.html` }));
} else {
  console.warn(`[backend] Static root not found (${staticRoot}); skip serving built frontend. Vite dev server should handle assets on :5173.`);
}

// Start server
const port = parseInt(process.env.PORT || "3000");
console.log(`Server running on port ${port}`);

serve({
  fetch: app.fetch,
  port,
});
