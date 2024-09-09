import { waitOnExecutionContext, env } from "cloudflare:test";
import { describe, it, expect, beforeAll } from "vitest";
import { onRequest /*getGiftCardById, orderGiftCard, isDuplicateOrder, getExchangeRate, validateTransaction*/ } from "./post-order";
import { createContext, DEFAULT_BASE_URL } from "../vitest/helpers";
import { getGiftCards } from "./list-gift-cards";
import { getAccessToken } from "./helpers";

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

    // Create mock permits
    const response = await fetch("http://localhost:3000/create-mock-app");
    const resp = (await response.json()) as { success: boolean };
    expect(resp.success).toBe(true);
  });

  it("simple order", async () => {
    const { productId } = giftCards[0];
    const chainId = "1";
    let response;

    response = await fetch("/create-mock-permit");
    // const permit = await response.json();

    response = await fetch("/create-mock-transfer");
    const resp = (await response.json()) as { txHash: string };

    const { ctx, eventCtx } = createContext(DEFAULT_BASE_URL, { productId, txHash: resp.txHash, chainId });

    response = await onRequest(eventCtx);
    await waitOnExecutionContext(ctx);

    expect(response.status).toBe(404);
    expect(await response.text()).toContain("Order not found");
  });
});

describe("Post order helpers", () => {
  it("wrong credentials", async () => {
    // void expect(() => getTransactionFromOrderId("asd", { token: "token", isSandbox: true })).rejects.toThrowError(
    //   'Error from Reloadly API: {"status":401,"message":"Full authentication is required to access this resource"}'
    // );
  });
});
