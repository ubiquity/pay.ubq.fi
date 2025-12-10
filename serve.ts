import { serveDir } from "jsr:@std/http/file-server";

const root = Deno.env.get("STATIC_DIR") ?? "static";

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const path = url.pathname;

  // Try to serve the file directly
  const response = await serveDir(req, { fsRoot: root, quiet: true });

  // If it's a 404 and not a file request, serve index.html for SPA routing
  if (response.status === 404 && !path.includes(".")) {
    return await serveDir(new Request(`${url.origin}/index.html`), { fsRoot: root, quiet: true });
  }

  return response;
});
