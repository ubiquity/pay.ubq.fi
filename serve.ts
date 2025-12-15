import { serveDir, serveFile } from "jsr:@std/http/file-server";
import { createClient } from "npm:@supabase/supabase-js@2.56.0";
import { decodeFunctionData } from "npm:viem@2.24.1";
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

const OLD_PERMIT2_ADDRESS = "0x000000000022D473030F116dDEE9F6B43aC78BA3";
const NEW_PERMIT2_ADDRESS = "0xd635918A75356D133d5840eE5c9ED070302C9C60";
const PERMIT2_ADDRESSES = new Set([OLD_PERMIT2_ADDRESS.toLowerCase(), NEW_PERMIT2_ADDRESS.toLowerCase()]);

const permit2DecodeAbi = [
  {
    inputs: [
      {
        components: [
          {
            components: [
              { name: "token", type: "address" },
              { name: "amount", type: "uint256" },
            ],
            name: "permitted",
            type: "tuple",
          },
          { name: "nonce", type: "uint256" },
          { name: "deadline", type: "uint256" },
        ],
        name: "permit",
        type: "tuple",
      },
      {
        components: [
          { name: "to", type: "address" },
          { name: "requestedAmount", type: "uint256" },
        ],
        name: "transferDetails",
        type: "tuple",
      },
      { name: "owner", type: "address" },
      { name: "signature", type: "bytes" },
    ],
    name: "permitTransferFrom",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        components: [
          {
            components: [
              { name: "token", type: "address" },
              { name: "amount", type: "uint256" },
            ],
            name: "permitted",
            type: "tuple[]",
          },
          { name: "nonce", type: "uint256" },
          { name: "deadline", type: "uint256" },
        ],
        name: "permit",
        type: "tuple",
      },
      {
        components: [
          { name: "to", type: "address" },
          { name: "requestedAmount", type: "uint256" },
        ],
        name: "transferDetails",
        type: "tuple[]",
      },
      { name: "owner", type: "address" },
      { name: "signature", type: "bytes" },
    ],
    name: "permitTransferFrom",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        components: [
          {
            components: [
              { name: "token", type: "address" },
              { name: "amount", type: "uint256" },
            ],
            name: "permitted",
            type: "tuple",
          },
          { name: "nonce", type: "uint256" },
          { name: "deadline", type: "uint256" },
        ],
        name: "permits",
        type: "tuple[]",
      },
      {
        components: [
          { name: "to", type: "address" },
          { name: "requestedAmount", type: "uint256" },
        ],
        name: "transferDetails",
        type: "tuple[]",
      },
      { name: "owners", type: "address[]" },
      { name: "signatures", type: "bytes[]" },
    ],
    name: "batchPermitTransferFrom",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;

const jsonResponse = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const port = parseInt(Deno.env.get("PORT") ?? "8000", 10);

const normalizeHexLowerNo0x = (value: string) => value.trim().toLowerCase().replace(/^0x/, "");

const isValidTxHash = (value: string) => /^[0-9a-f]{64}$/.test(normalizeHexLowerNo0x(value));

const isValidAddress = (value: string) => /^[0-9a-f]{40}$/.test(normalizeHexLowerNo0x(value));

const isValidPermitSignatureHex = (value: string) => {
  const normalized = normalizeHexLowerNo0x(value);
  return /^[0-9a-f]+$/.test(normalized) && (normalized.length === 128 || normalized.length === 130);
};

const to0xLower = (value: string) => `0x${normalizeHexLowerNo0x(value)}`;

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
    const body = (await req.json().catch(() => null)) as unknown;
    if (!body || typeof body !== "object") {
      return jsonResponse(400, { error: "Invalid JSON body" });
    }

    const { transactionHash, networkId } = body as {
      transactionHash?: string;
      networkId?: number | string;
      signature?: string;
    };

    const parsedChainId = typeof networkId === "string" ? Number.parseInt(networkId, 10) : networkId;
    if (typeof parsedChainId !== "number" || !Number.isSafeInteger(parsedChainId) || parsedChainId <= 0) {
      return jsonResponse(400, { error: "Invalid networkId" });
    }
    const chainId = parsedChainId;

    if (typeof transactionHash !== "string" || !isValidTxHash(transactionHash)) {
      return jsonResponse(400, { error: "Invalid transactionHash" });
    }

    const txHashWithPrefix = to0xLower(transactionHash);

    const tx = (await rpcCall(chainId, "eth_getTransactionByHash", [txHashWithPrefix])) as {
      input?: string;
      blockHash?: string | null;
      to?: string | null;
    } | null;

    if (!tx) {
      return jsonResponse(404, { error: "Transaction not found" });
    }
    if (!tx.blockHash) {
      return jsonResponse(400, { error: "Transaction not mined yet" });
    }

    if (typeof tx.to !== "string" || !isValidAddress(tx.to) || !PERMIT2_ADDRESSES.has(tx.to.toLowerCase())) {
      return jsonResponse(400, { error: "Transaction is not a Permit2 call" });
    }

    const receipt = (await rpcCall(chainId, "eth_getTransactionReceipt", [txHashWithPrefix])) as { status?: string } | null;
    if (!receipt) {
      return jsonResponse(400, { error: "Transaction receipt unavailable" });
    }
    if (receipt.status?.toLowerCase() !== "0x1") {
      return jsonResponse(400, { error: "Transaction failed" });
    }

    if (typeof tx.input !== "string" || !tx.input.startsWith("0x")) {
      return jsonResponse(400, { error: "Transaction input unavailable" });
    }

    let extractedSignatures: string[] = [];
    try {
      const decoded = decodeFunctionData({
        abi: permit2DecodeAbi as unknown as readonly unknown[],
        data: tx.input as `0x${string}`,
      });

      const args = decoded.args as readonly unknown[];
      if (decoded.functionName === "permitTransferFrom") {
        const signature = args.at(-1);
        if (typeof signature !== "string") {
          return jsonResponse(400, { error: "Failed to extract Permit2 signature" });
        }
        extractedSignatures = [signature];
      } else if (decoded.functionName === "batchPermitTransferFrom") {
        const signatures = args.at(-1);
        if (!Array.isArray(signatures) || !signatures.every((s) => typeof s === "string")) {
          return jsonResponse(400, { error: "Failed to extract Permit2 signatures" });
        }
        extractedSignatures = signatures;
      } else {
        return jsonResponse(400, { error: `Unsupported Permit2 function: ${decoded.functionName}` });
      }
    } catch (error) {
      console.error("Error decoding calldata:", error);
      return jsonResponse(400, { error: "Unable to decode Permit2 calldata" });
    }

    const normalizedSignatures = Array.from(new Set(extractedSignatures.map(to0xLower)));
    if (!normalizedSignatures.length) {
      return jsonResponse(400, { error: "No signatures found in transaction input" });
    }
    if (!normalizedSignatures.every(isValidPermitSignatureHex)) {
      return jsonResponse(400, { error: "Invalid signature format in transaction input" });
    }

    const { data: existing, error: selectError } = await supabase.from("permits").select("id, signature, transaction").in("signature", normalizedSignatures);
    if (selectError) throw selectError;

    const conflicting = (existing ?? []).filter((row) => row.transaction && String(row.transaction).toLowerCase() !== txHashWithPrefix);
    if (conflicting.length > 0) {
      return jsonResponse(409, {
        success: false,
        error: "One or more permits already have a different recorded transaction",
        conflicts: conflicting.map((row) => row.signature),
      });
    }

    const { data: updatedRows, error: updateError } = await supabase
      .from("permits")
      .update({ transaction: txHashWithPrefix })
      .in("signature", normalizedSignatures)
      .is("transaction", null)
      .select("id, signature");
    if (updateError) throw updateError;

    const updated = updatedRows?.length ?? 0;
    const matched = new Set((existing ?? []).map((row) => row.signature));
    const missing = normalizedSignatures.filter((sig) => !matched.has(sig));

    return jsonResponse(200, { success: true, extracted: normalizedSignatures.length, updated, missing });
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

Deno.serve({ port }, handleRequest);
