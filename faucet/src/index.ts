import { Relayer } from "defender-relay-client/lib/relayer";
import { toHex, formatEther } from "viem";
import { makeResponseFunc } from "./helpers";
import { createClient } from "@supabase/supabase-js";

export interface Env {
  RELAY_KEY: string;
  RELAY_SECRET: string;
  SUPABASE_URL: string;
  SUPABASE_KEY: string;
  CLAIM_FEE: bigint;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (!env.RELAY_KEY || !env.RELAY_SECRET) {
      return new Response("Relayer not configured", { status: 500 });
    }

    if (!env.SUPABASE_URL || !env.SUPABASE_KEY) {
      return new Response("Supabase not configured", { status: 500 });
    }

    if (!env.CLAIM_FEE) {
      return new Response("Claim fee not configured", { status: 500 });
    }

    const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_KEY);

    const { makeResponse, makeRpcResponse } = makeResponseFunc(request.headers.get("origin") || "");

    if (request.method !== "POST") {
      return makeResponse(`Unsupported method: ${request.method}`, 405);
    }

    const q = url.searchParams.toString();
    const addressParam = q.split("?").find(param => param.startsWith("address="));
    const ethAddress = addressParam ? addressParam.split("=")[1] : null;

    if (!ethAddress) {
      return makeRpcResponse({ error: { code: -32000, message: "No address provided" } }, 400);
    }

    const { data } = await supabase.from("wallets").select("wallet_address").eq("wallet_address", ethAddress);

    if (data.length === 0) {
      return makeRpcResponse({ error: { code: -32000, message: "Address not found" } }, 400);
    }

    // Searching using github api might not return all users so I'm sticking to the db
    // this can be worked around if they change their registered wallet address
    // but it's inherently abuse-proof as to get a subsidy you must have a permit == need a contribution for 0.0003 eth/xdai
    const { data: addressInPermits } = await supabase.from("permits").select("bounty_hunter_address").eq("bounty_hunter_address", ethAddress);

    if (addressInPermits) {
      return makeRpcResponse({ error: { code: -32000, message: "Has likely been subsidized before." } }, 400);
    }

    const relayer = new Relayer({
      apiKey: env.RELAY_KEY,
      apiSecret: env.RELAY_SECRET,
    });

    const userBal = await relayer.call("eth_getBalance", [ethAddress, "latest"]);

    if (userBal.result > env.CLAIM_FEE) {
      return makeRpcResponse({ error: { code: -32000, message: "Hunter has enough gas" } }, 400);
    }

    const relay_ = await relayer.getRelayer();

    const relayBal = await relayer.call("eth_getBalance", [relay_.address, "latest"]);

    if (relayBal.result < env.CLAIM_FEE) {
      return makeRpcResponse({ error: { code: -32000, message: "Faucet has no funds" } }, 400);
    }

    const tx = await relayer.sendTransaction({
      to: ethAddress,
      value: toHex(env.CLAIM_FEE),
      speed: "fast",
      gasLimit: 21000,
    });

    if (!tx.transactionId) {
      return makeRpcResponse({ error: { code: -32000, message: "Transaction failed" } }, 400);
    }

    return makeRpcResponse({ result: { txHash: tx.hash } }, 200);
  },
};
