import { serveDir, serveFile } from "jsr:@std/http/file-server";

// Default to the built frontend output so we don't 404 if STATIC_DIR is missing.
const root = Deno.env.get("STATIC_DIR") ?? "frontend/dist";

Deno.serve(async (req) => {
  const isHead = req.method === "HEAD";
  const request = isHead ? new Request(req.url, { method: "GET", headers: req.headers }) : req;
  const url = new URL(req.url);
  const path = url.pathname;

  // Try to serve the file directly (HEAD is coerced to GET to avoid 405s on probes)
  let response = await serveDir(request, { fsRoot: root, quiet: true });

  // If it's a 404 and not a file request, serve index.html for SPA routing
  if (response.status === 404 && !path.includes(".")) {
    response = await serveFile(request, `${root}/index.html`);
  }

  if (isHead) {
    return new Response(null, { status: response.status, headers: response.headers });
  }

  return response;
});
