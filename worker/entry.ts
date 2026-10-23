/**
 * Cloudflare Workers port of pay.ubq.fi.
 *
 * The Vite SPA (dist/) is served from the assets binding with the previous
 * serve.ts behavior: files as-is, index.html for non-file 404s, and
 * POST /api/permits/record-claim handled here.
 *
 * The claim handler mirrors serve.ts: validate the transaction over JSON-RPC
 * (RPC_URL, default https://rpc.ubq.fi), decode the Permit2 call with viem,
 * then read/update the Supabase `permits` rows. It needs SUPABASE_URL and
 * SUPABASE_SERVICE_ROLE_KEY (Worker secrets); without them the endpoint
 * answers the same "Supabase not configured" error the Deno server produced.
 */
import { decodeFunctionData } from "viem";
import type { Tables, TablesUpdate } from "../src/database.types.ts";

export interface Env {
  ASSETS: { fetch(request: Request): Promise<Response> };
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  RPC_URL?: string;
}

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

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

const normalizeHexLowerNo0x = (value: string) => value.trim().toLowerCase().replace(/^0x/, "");
const isValidTxHash = (value: string) => /^[0-9a-f]{64}$/.test(normalizeHexLowerNo0x(value));
const isValidAddress = (value: string) => /^[0-9a-f]{40}$/.test(normalizeHexLowerNo0x(value));
const isValidPermitSignatureHex = (value: string) => {
  const normalized = normalizeHexLowerNo0x(value);
  return /^[0-9a-f]+$/.test(normalized) && (normalized.length === 128 || normalized.length === 130);
};
const to0xLower = (value: string) => `0x${normalizeHexLowerNo0x(value)}`;

type PermitClaimLookupRow = Pick<Tables<"permits">, "id" | "signature" | "transaction">;
type PermitClaimUpdatedRow = Pick<Tables<"permits">, "id" | "signature">;
type PermitClaimUpdate = Pick<TablesUpdate<"permits">, "transaction">;

async function supabaseRequest(env: Env, path: string, init: RequestInit = {}): Promise<Response> {
  const url = `${env.SUPABASE_URL!.replace(/\/$/, "")}/rest/v1/${path}`;
  return await fetch(url, {
    ...init,
    headers: {
      "content-type": "application/json",
      apikey: env.SUPABASE_SERVICE_ROLE_KEY!,
      authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY!}`,
      ...((init.headers as Record<string, string> | undefined) ?? {}),
    },
  });
}

async function handleRecordClaim(request: Request, env: Env): Promise<Response> {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return jsonResponse(500, { error: "Supabase not configured" });
  }

  try {
    const body = (await request.json().catch(() => null)) as unknown;
    if (!body || typeof body !== "object") return jsonResponse(400, { error: "Invalid JSON body" });

    const { transactionHash, networkId } = body as { transactionHash?: string; networkId?: number | string };
    const parsedChainId = typeof networkId === "string" ? Number.parseInt(networkId, 10) : networkId;
    if (typeof parsedChainId !== "number" || !Number.isSafeInteger(parsedChainId) || parsedChainId <= 0) {
      return jsonResponse(400, { error: "Invalid networkId" });
    }
    const chainId = parsedChainId;
    if (typeof transactionHash !== "string" || !isValidTxHash(transactionHash)) {
      return jsonResponse(400, { error: "Invalid transactionHash" });
    }
    const txHashWithPrefix = to0xLower(transactionHash);

    const rpcBaseUrl = (env.RPC_URL ?? "https://rpc.ubq.fi").replace(/\/$/, "");
    const rpcCall = async (method: string, params: unknown[]) => {
      const response = await fetch(`${rpcBaseUrl}/${chainId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      });
      if (!response.ok) throw new Error(`RPC ${method} failed: HTTP ${response.status}`);
      const json = (await response.json()) as { error?: { message?: string }; result?: unknown };
      if (json.error) throw new Error(json.error.message ?? `RPC ${method} error`);
      return json.result;
    };

    const tx = (await rpcCall("eth_getTransactionByHash", [txHashWithPrefix])) as { input?: string; blockHash?: string | null; to?: string | null } | null;
    if (!tx) return jsonResponse(404, { error: "Transaction not found" });
    if (!tx.blockHash) return jsonResponse(400, { error: "Transaction not mined yet" });
    if (typeof tx.to !== "string" || !isValidAddress(tx.to) || !PERMIT2_ADDRESSES.has(tx.to.toLowerCase())) {
      return jsonResponse(400, { error: "Transaction is not a Permit2 call" });
    }

    const receipt = (await rpcCall("eth_getTransactionReceipt", [txHashWithPrefix])) as { status?: string } | null;
    if (!receipt) return jsonResponse(400, { error: "Transaction receipt unavailable" });
    if (receipt.status?.toLowerCase() !== "0x1") return jsonResponse(400, { error: "Transaction failed" });
    if (typeof tx.input !== "string" || !tx.input.startsWith("0x")) {
      return jsonResponse(400, { error: "Transaction input unavailable" });
    }

    let extractedSignatures: string[] = [];
    try {
      const decoded = decodeFunctionData({ abi: permit2DecodeAbi, data: tx.input as `0x${string}` });
      const args = decoded.args as readonly unknown[];
      if (decoded.functionName === "permitTransferFrom") {
        const signature = args.at(-1);
        if (typeof signature !== "string") return jsonResponse(400, { error: "Failed to extract Permit2 signature" });
        extractedSignatures = [signature];
      } else if (decoded.functionName === "batchPermitTransferFrom") {
        const signatures = args.at(-1);
        if (!Array.isArray(signatures) || !signatures.every((value) => typeof value === "string")) {
          return jsonResponse(400, { error: "Failed to extract Permit2 signatures" });
        }
        extractedSignatures = signatures as string[];
      } else {
        return jsonResponse(400, { error: `Unsupported Permit2 function: ${decoded.functionName}` });
      }
    } catch (error) {
      console.error("Error decoding calldata:", error);
      return jsonResponse(400, { error: "Unable to decode Permit2 calldata" });
    }

    const normalizedSignatures = Array.from(new Set(extractedSignatures.map(to0xLower)));
    if (!normalizedSignatures.length) return jsonResponse(400, { error: "No signatures found in transaction input" });
    if (!normalizedSignatures.every(isValidPermitSignatureHex)) {
      return jsonResponse(400, { error: "Invalid signature format in transaction input" });
    }

    const inList = `(${normalizedSignatures.map((signature) => `"${signature}"`).join(",")})`;
    const selectResponse = await supabaseRequest(env, `permits?select=id,signature,transaction&signature=in.${inList}`);
    if (!selectResponse.ok) throw new Error(`Supabase select failed: HTTP ${selectResponse.status}`);
    const existingRows = (await selectResponse.json()) as PermitClaimLookupRow[];

    const conflicting = existingRows.filter((row) => row.transaction && String(row.transaction).toLowerCase() !== txHashWithPrefix);
    if (conflicting.length > 0) {
      return jsonResponse(409, {
        success: false,
        error: "One or more permits already have a different recorded transaction",
        conflicts: conflicting.map((row) => row.signature),
      });
    }

    const updateResponse = await supabaseRequest(env, `permits?signature=in.${inList}&transaction=is.null&select=id,signature`, {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ transaction: txHashWithPrefix } satisfies PermitClaimUpdate),
    });
    if (!updateResponse.ok) throw new Error(`Supabase update failed: HTTP ${updateResponse.status}`);
    const updatedRows = (await updateResponse.json()) as PermitClaimUpdatedRow[];

    const matched = new Set(existingRows.map((row) => row.signature));
    const missing = normalizedSignatures.filter((signature) => !matched.has(signature));

    return jsonResponse(200, { success: true, extracted: normalizedSignatures.length, updated: updatedRows.length, missing });
  } catch (error) {
    console.error("Error recording claim:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return jsonResponse(500, { error: "Failed to record claim", details: message });
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "POST" && url.pathname === "/api/permits/record-claim") {
      return await handleRecordClaim(request, env);
    }

    const response = await env.ASSETS.fetch(request);
    if (response.status === 404 && !url.pathname.includes(".")) {
      return await env.ASSETS.fetch(new Request(new URL("/index.html", url), { method: "GET" }));
    }
    return response;
  },
};
