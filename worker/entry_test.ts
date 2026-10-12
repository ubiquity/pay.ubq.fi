import { afterEach, describe, expect, test } from "bun:test";
import { encodeFunctionData, pad } from "viem";
import worker, { type Env } from "./entry";

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

const PERMIT2 = "0x000000000022D473030F116dDEE9F6B43aC78BA3";
const SIGNATURE = `0x${"ab".repeat(65)}`;
const TX_HASH = `0x${"cd".repeat(32)}`;

const abi = [
  {
    inputs: [
      { components: [{ components: [{ name: "token", type: "address" }, { name: "amount", type: "uint256" }], name: "permitted", type: "tuple" }, { name: "nonce", type: "uint256" }, { name: "deadline", type: "uint256" }], name: "permit", type: "tuple" },
      { components: [{ name: "to", type: "address" }, { name: "requestedAmount", type: "uint256" }], name: "transferDetails", type: "tuple" },
      { name: "owner", type: "address" },
      { name: "signature", type: "bytes" },
    ],
    name: "permitTransferFrom",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;

function validCalldata(): string {
  return encodeFunctionData({
    abi,
    functionName: "permitTransferFrom",
    args: [
      { permitted: { token: `0x${"11".repeat(20)}`, amount: 1000n }, nonce: 1n, deadline: 9999999999n },
      { to: `0x${"22".repeat(20)}`, requestedAmount: 1000n },
      `0x${"33".repeat(20)}`,
      SIGNATURE,
    ],
  });
}

type Route = (url: string, init?: RequestInit) => Response | null;

function mockFetch(route: Route): { calls: Array<{ url: string; init?: RequestInit }> } {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    calls.push({ url, init });
    const response = route(url, init);
    if (!response) throw new Error(`unexpected fetch: ${url}`);
    return response;
  }) as typeof fetch;
  return { calls };
}

const envWithSupabase: Env = {
  ASSETS: { fetch: async () => new Response("asset") },
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

describe("pay claim endpoint", () => {
  test("records a valid Permit2 claim", async () => {
    const { calls } = mockFetch((url, init) => {
      if (url.startsWith("https://rpc.ubq.fi/1")) {
        const payload = JSON.parse(String(init?.body));
        if (payload.method === "eth_getTransactionByHash") {
          return json({ jsonrpc: "2.0", id: 1, result: { input: validCalldata(), blockHash: "0xblock", to: PERMIT2 } });
        }
        if (payload.method === "eth_getTransactionReceipt") {
          return json({ jsonrpc: "2.0", id: 1, result: { status: "0x1" } });
        }
      }
      if (url.includes("/rest/v1/permits?select=")) {
        return json([{ id: 1, signature: SIGNATURE.toLowerCase(), transaction: null }]);
      }
      if (url.includes("/rest/v1/permits?") && init?.method === "PATCH") {
        return json([{ id: 1, signature: SIGNATURE.toLowerCase() }]);
      }
      return null;
    });

    const response = await worker.fetch(
      new Request("https://pay.ubq.fi/api/permits/record-claim", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ transactionHash: TX_HASH, networkId: 1 }),
      }),
      envWithSupabase,
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true, extracted: 1, updated: 1, missing: [] });
    const patch = calls.find((call) => call.init?.method === "PATCH");
    expect(patch).toBeTruthy();
    expect(JSON.parse(String(patch!.init!.body))).toEqual({ transaction: TX_HASH });
    expect(patch!.url).toContain("transaction=is.null");
  });

  test("rejects a conflicting recorded transaction", async () => {
    mockFetch((url, init) => {
      if (url.startsWith("https://rpc.ubq.fi/")) {
        const payload = JSON.parse(String(init?.body));
        if (payload.method === "eth_getTransactionByHash") {
          return json({ jsonrpc: "2.0", id: 1, result: { input: validCalldata(), blockHash: "0xblock", to: PERMIT2 } });
        }
        return json({ jsonrpc: "2.0", id: 1, result: { status: "0x1" } });
      }
      if (url.includes("/rest/v1/permits?select=")) {
        return json([{ id: 1, signature: SIGNATURE.toLowerCase(), transaction: `0x${"ee".repeat(32)}` }]);
      }
      return null;
    });

    const response = await worker.fetch(
      new Request("https://pay.ubq.fi/api/permits/record-claim", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ transactionHash: TX_HASH, networkId: 1 }),
      }),
      envWithSupabase,
    );

    expect(response.status).toBe(409);
    const body = await response.json() as { success: boolean; conflicts: string[] };
    expect(body.success).toBe(false);
    expect(body.conflicts).toEqual([SIGNATURE.toLowerCase()]);
  });

  test("rejects a non-Permit2 transaction", async () => {
    mockFetch((url, init) => {
      if (url.startsWith("https://rpc.ubq.fi/")) {
        const payload = JSON.parse(String(init?.body));
        if (payload.method === "eth_getTransactionByHash") {
          return json({ jsonrpc: "2.0", id: 1, result: { input: "0x", blockHash: "0xblock", to: `0x${"44".repeat(20)}` } });
        }
      }
      if (url.includes("/rest/v1/")) return json([]);
      return null;
    });

    const response = await worker.fetch(
      new Request("https://pay.ubq.fi/api/permits/record-claim", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ transactionHash: TX_HASH, networkId: 1 }),
      }),
      envWithSupabase,
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Transaction is not a Permit2 call" });
  });

  test("answers Supabase not configured without secrets", async () => {
    const response = await worker.fetch(
      new Request("https://pay.ubq.fi/api/permits/record-claim", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ transactionHash: TX_HASH, networkId: 1 }),
      }),
      { ASSETS: { fetch: async () => new Response("asset") } },
    );
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "Supabase not configured" });
  });
});
