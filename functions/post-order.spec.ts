import { waitOnExecutionContext, env } from "cloudflare:test";
import { describe, it, expect, beforeAll, vi } from "vitest";
import { JsonRpcProvider, TransactionReceipt, TransactionResponse } from "@ethersproject/providers";
import { onRequest, getGiftCardById /*orderGiftCard, isDuplicateOrder, getExchangeRate, validateTransaction*/ } from "./post-order";
import { getGiftCards } from "./list-gift-cards";
import { getAccessToken } from "./helpers";
import { createContext, createMockResponse } from "../vitest/helpers";
import { MOCK_TX_HASH, DEFAULT_BASE_URL } from "../vitest/constants";

let giftCards = [];

describe("Post Order", () => {
  beforeAll(async () => {
    const accessToken = await getAccessToken(env);
    const country = "US";
    const productQuery = "visa";

    // Fetch available cards
    const cards = await getGiftCards(productQuery, country, accessToken);
    expect(cards.length, `No cards for ${country} country`).toBeGreaterThan(0);
    giftCards = cards;
  });

  it("simple order", async () => {
    const { productId } = giftCards[0];
    const chainId = 100;

    const { ctx, eventCtx } = createContext(DEFAULT_BASE_URL, { productId, txHash: MOCK_TX_HASH, chainId }, "POST");

    const { transaction, transactionReceipt } = createMockResponse("OK_TRANSFER_TO_TREASURY");

    vi.spyOn(JsonRpcProvider.prototype, "getTransactionReceipt").mockImplementation(
      async (transactionHash: string | Promise<string>): Promise<TransactionReceipt> => {
        await transactionHash;

        return transactionReceipt as unknown as TransactionReceipt;
      }
    );

    vi.spyOn(JsonRpcProvider.prototype, "getTransaction").mockImplementation(
      async (transactionHash: string | Promise<string>): Promise<TransactionResponse> => {
        await transactionHash;

        return transaction as unknown as TransactionResponse;
      }
    );

    const response = await onRequest(eventCtx);
    await waitOnExecutionContext(ctx);

    expect(response.status).toBe(200);
  });
});

describe("Post order helpers", () => {
  it("", async () => {
    const accessToken = await getAccessToken(env);
    const resp = await getGiftCardById(1, accessToken);
    expect(resp).toBeDefined();
  });
});
