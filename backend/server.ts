import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { createClient } from "@supabase/supabase-js";
import type { Context } from "hono";
import { Hono } from "hono";
import { cors } from "hono/cors";\nimport type { Database, Tables, TablesInsert, TablesUpdate } from "../frontend/src/database.types.js";

import { createLogger } from \"../lib/debug/index.js\";\n\nconst logger = createLogger('backend:server');\nconst app = new Hono();
app.use("*", cors());

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set");
}

const supabase = createClient<Database>(supabaseUrl, supabaseKey);

// API endpoint for recording claims\ntype RecordClaimRequest = {\n  signature: string;\n  transactionHash: string;\n};
app.post("/api/permits/record-claim", async (c: Context) => {
  try {
    const { signature, transactionHash }: RecordClaimRequest = await c.req.json();

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

// Serve static files for the frontend
app.use("/*", serveStatic({ root: "./frontend/dist" }));
app.use("/*", serveStatic({ path: "./frontend/dist/index.html" }));

// Start server
const port = parseInt(process.env.PORT || "3000");
logger.info(`Server running on port ${port}`);

serve({
  fetch: app.fetch,
  port,
});
