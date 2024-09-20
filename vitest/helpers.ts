import { env, createExecutionContext, Parameters } from "cloudflare:test";
import { Context } from "../functions/types";
import { TransactionReceipt, TransactionResponse } from "@ethersproject/providers";
import { BigNumber } from "ethers";

export function createContext(baseUrl: string, paramsOrBody: Record<string, string>, method: "POST" | "GET" = "GET") {
  const url = new URL(baseUrl);
  url.search = new URLSearchParams(paramsOrBody).toString();
  const request = new Request(url, {
    method,
    body: JSON.stringify(paramsOrBody),
  });
  const ctx = createExecutionContext();
  const eventCtx: Parameters<(ctx: Context) => Promise<Response>>[0] = {
    request,
    functionPath: "",
    waitUntil: ctx.waitUntil.bind(ctx),
    passThroughOnException: ctx.passThroughOnException.bind(ctx),
    env,
  };
  return { request, ctx, eventCtx };
}

// type ResponseTypes = "OK_TRANSFER_TO_TREASURY" | "USED_TRANSFER" | "NO_TRANSFER";

// Creates the minimum transaction and receipts objects to mock a `permitTransferFrom` call
export function createMockResponse(/*type?: ResponseTypes*/): { transactionReceipt: TransactionReceipt; transaction: TransactionResponse } {
  const baseTransactionReceipt = {
    to: "",
    from: "",
    contractAddress: "",
    transactionIndex: 1,
    root: "",
    gasUsed: BigNumber.from(42),
    logsBloom: "",
    blockHash: "",
    transactionHash: "",
    logs: [
      {
        blockNumber: 1,
        blockHash: "",
        transactionIndex: 1,

        removed: true,

        address: "",
        data: "",

        topics: [""],

        transactionHash: "",
        logIndex: 1,
      },
    ],
    blockNumber: 1,
    confirmations: 1,
    cumulativeGasUsed: BigNumber.from(42),
    effectiveGasPrice: BigNumber.from(42),
    byzantium: true,
    type: 1,
    status: 1,
  };

  const baseTransaction = {
    nonce: 1,

    gasLimit: BigNumber.from(32),

    data: "0x30f28b7a000000000000000000000000e91d153e0b41518a2ce8dd3d7944fa863463a97d00000000000000000000000000000000000000000000002f655276c54a7900000ded68c73a58bf5f21b515d79942538e0294674e28225a65ba2b7a68ac303cf37fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff000000000000000000000000e7a9fdf596d869af34a130fa9607178b2b9800d900000000000000000000000000000000000000000000002f655276c54a7900000000000000000000000000009051eda96db419c967189f4ac303a290f33276800000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000004158c5ae43ab1f9a50cc27d499f0ce4c58d48b6e0539053c6f6289f4b3db50242c1ef82ff467b03b80f088ce0a8f383d633a3fb55e14c6d2b4901852fa657cf7581b00000000000000000000000000000000000000000000000000000000000000",
    value: BigNumber.from(42),
    chainId: 1,
    hash: "",
    blockNumber: 1,
    blockHash: "",
    timestamp: 1,
    confirmations: 1,
    from: "",
    raw: "",
    wait: async (/*confirmations?: number*/) => {
      return baseTransactionReceipt;
    },
  };

  return {
    transaction: baseTransaction,
    transactionReceipt: baseTransactionReceipt,
  };
}
