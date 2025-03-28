import { logger } from "hono/middleware.ts";
import { Hono } from "hono/mod.ts";
import { serve } from "https://deno.land/std@0.177.0/http/server.ts"; // Use older std/http server

const app = new Hono();

// Middleware
app.use("*", logger());

// Basic route
app.get("/", (c) => {
  return c.text("Permit Claiming API");
});

// Placeholder for permit routes
app.get("/permits", (c) => {
  // TODO: Fetch permits for authenticated user
  return c.json({ message: "TODO: Fetch permits" });
});

app.post("/permits/update-status", (c) => {
  // TODO: Update permit status after claim
  return c.json({ message: "TODO: Update permit status" });
});

// TODO: Add GitHub OAuth routes

console.log("API server running on http://localhost:8000");
serve(app.fetch); // Use listenAndServe from std/http
