import { serveDir, serveFile } from "jsr:@std/http/file-server";
import { createClient } from "npm:@supabase/supabase-js@2.56.0";
import type { Database } from "./src/database.types.ts";

// Default to the built frontend output so we don't 404 if STATIC_DIR is missing.
const root = Deno.env.get("STATIC_DIR") ?? "dist";

const supabaseUrl = Deno.env.get("SUPABASE_URL");
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const rpcBaseUrl = Deno.env.get("RPC_URL") ?? "https://rpc.ubq.fi";

if (!supabaseUrl || !supabaseKey) {
  console.warn("[serve] Supabase env missing; permit claim API disabled.");
}

const supabase = supabaseUrl && supabaseKey ? createClient<Database>(supabaseUrl, supabaseKey) : null;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS,HEAD",
  "Access-Control-Allow-Headers": "Content-Type",
};

const jsonResponse = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const withCors = (response: Response) => {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(corsHeaders)) {
    headers.set(key, value);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
};

const port = parseInt(Deno.env.get("PORT") ?? "8000", 10);

const rpcCall = async (chainId: number, method: string, params: unknown[]) => {
  const endpoint = `${rpcBaseUrl.replace(/\/$/, "")}/${chainId}`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });

  if (!response.ok) {
    throw new Error(`RPC ${method} failed: HTTP ${response.status}`);
  }

  const json = (await response.json()) as { error?: { message?: string }; result?: unknown };
  if (json.error) {
    throw new Error(json.error.message ?? `RPC ${method} error`);
  }

  return json.result;
};

const handleRecordClaim = async (req: Request) => {
  if (!supabase) {
    return jsonResponse(500, { error: "Supabase not configured" });
  }

  try {
    const { signature, transactionHash, networkId } = (await req.json()) as {
      signature?: string;
      transactionHash?: string;
      networkId?: number | string;
    };

    const chainId = typeof networkId === "string" ? Number.parseInt(networkId, 10) : networkId;

    if (typeof signature !== "string" || typeof transactionHash !== "string" || !chainId) {
      return jsonResponse(400, { error: "Missing required fields: signature, transactionHash, networkId" });
    }

    const normalizedSignature = signature.toLowerCase().replace(/^0x/, "");
    const normalizedTxHash = transactionHash.toLowerCase();

    if (!/^[0-9a-f]{64}$/.test(normalizedTxHash.replace(/^0x/, ""))) {
      return jsonResponse(400, { error: "Invalid transactionHash" });
    }
    if (!/^[0-9a-f]+$/.test(normalizedSignature) || normalizedSignature.length < 16) {
      return jsonResponse(400, { error: "Invalid signature" });
    }

    const tx = (await rpcCall(chainId, "eth_getTransactionByHash", [normalizedTxHash])) as { input?: string; blockHash?: string | null } | null;
    if (!tx?.input || !tx.blockHash) {
      return jsonResponse(400, { error: "Transaction not found or not mined yet" });
    }

    const receipt = (await rpcCall(chainId, "eth_getTransactionReceipt", [normalizedTxHash])) as { status?: string } | null;
    if (!receipt?.status || receipt.status.toLowerCase() !== "0x1") {
      return jsonResponse(400, { error: "Transaction failed or receipt unavailable" });
    }

    const txInput = tx.input.toLowerCase().replace(/^0x/, "");
    if (!txInput.includes(normalizedSignature)) {
      return jsonResponse(400, { error: "Transaction does not include permit signature" });
    }

    const { data: candidates, error: selectError } = await supabase.from("permits").select("id, transaction").eq("signature", signature).limit(2);
    if (selectError) throw selectError;

    if (!candidates?.length) {
      return jsonResponse(404, { success: false, error: "Permit not found" });
    }
    if (candidates.length > 1) {
      return jsonResponse(409, { success: false, error: "Multiple permits matched signature; refusing to update" });
    }

    const permit = candidates[0];
    if (permit.transaction) {
      return jsonResponse(409, { success: true, updated: 0 });
    }

    const { data: updatedRows, error: updateError } = await supabase
      .from("permits")
      .update({ transaction: normalizedTxHash })
      .eq("id", permit.id)
      .is("transaction", null)
      .select("id");
    if (updateError) throw updateError;

    const updated = updatedRows?.length ?? 0;
    if (!updated) {
      return jsonResponse(409, { success: true, updated: 0 });
    }

    return jsonResponse(200, { success: true, updated });
  } catch (error) {
    console.error("Error recording claim:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return jsonResponse(500, { error: "Failed to record claim", details: message });
  }
};

const handleRequest = async (req: Request) => {
  const url = new URL(req.url);
  const pathname = url.pathname;

  if (req.method === "POST" && pathname === "/api/permits/record-claim") {
    return await handleRecordClaim(req);
  }

  const isHead = req.method === "HEAD";
  const request = isHead ? new Request(req.url, { method: "GET", headers: req.headers }) : req;

  // Try to serve the file directly (HEAD is coerced to GET to avoid 405s on probes)
  let response = await serveDir(request, { fsRoot: root, quiet: true });

  // If it's a 404 and not a file request, serve index.html for SPA routing
  if (response.status === 404 && !pathname.includes(".")) {
    response = await serveFile(request, `${root}/index.html`);
  }

  if (isHead) {
    return new Response(null, { status: response.status, headers: response.headers });
  }

  return response;
};

Deno.serve({ port }, async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  return withCors(await handleRequest(req));
});
