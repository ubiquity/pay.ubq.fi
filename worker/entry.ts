/**
 * Cloudflare Workers port of pay.ubq.fi.
 *
 * The Vite SPA (dist/) is served from the assets binding with the previous
 * serve.ts behavior: files as-is, index.html for non-file 404s, and
 * POST /api/permits/record-claim handled here.
 *
 * The claim endpoint is not cut over yet: it needs the Supabase service-role
 * key as a Worker secret (SUPABASE_SERVICE_ROLE_KEY) before pay.ubq.fi can be
 * routed here, because without it the endpoint cannot record claims. Until
 * then it answers with the same "Supabase not configured" error the Deno
 * server produced when its env was missing.
 */
export interface Env {
  ASSETS: { fetch(request: Request): Promise<Response> };
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "POST" && url.pathname === "/api/permits/record-claim") {
      return json({ error: "Supabase not configured" }, 500);
    }

    const response = await env.ASSETS.fetch(request);
    if (response.status === 404 && !url.pathname.includes(".")) {
      return await env.ASSETS.fetch(new Request(new URL("/index.html", url), { method: "GET" }));
    }
    return response;
  },
};
