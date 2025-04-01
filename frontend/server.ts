/// <reference types="https://deno.land/x/deno/cli/types/dts/index.d.ts" />

import { serve } from "https://deno.land/std@0.180.0/http/server.ts";
import { serveDir } from "https://deno.land/std@0.180.0/http/file_server.ts";
import { join } from "https://deno.land/std@0.180.0/path/mod.ts";

const PORT = 8000;
const STATIC_DIR = "dist"; // Vite's default output directory

// console.log(`Static file server running. Access it at: http://localhost:${PORT}/`);

serve(async (req) => {
  const url = new URL(req.url);
  const pathname = url.pathname;

  // Attempt to serve static file
  try {
    const response = await serveDir(req, {
      fsRoot: STATIC_DIR,
      urlRoot: "",
      showDirListing: false,
      quiet: true,
    });

    // If serveDir finds a file, return it
    if (response.status !== 404) {
      return response;
    }
  } catch (e) {
    // Ignore errors from serveDir (like file not found)
    console.error("Error serving static file:", e);
  }

  // If no static file found, serve index.html for SPA routing
  // console.log(`Serving index.html for path: ${pathname}`);
  const indexPath = join(STATIC_DIR, "index.html");
  try {
    const indexContent = await Deno.readFile(indexPath);
    return new Response(indexContent, {
      headers: { "Content-Type": "text/html" },
    });
  } catch (e) {
    console.error(`Error reading index.html at ${indexPath}:`, e);
    return new Response("Not Found", { status: 404 });
  }
}, { port: PORT });
