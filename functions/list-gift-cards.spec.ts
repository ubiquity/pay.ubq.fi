import { waitOnExecutionContext, env } from "cloudflare:test";
import { describe, it, expect } from "vitest";
import Chance from "chance";
import { onRequest, getGiftCards } from "./list-gift-cards";
import { createContext, DEFAULT_BASE_URL } from "./vitest-helpers";
import { getAccessToken } from "./helpers";

describe("List Gift Cards", () => {
  it("get supported gift cards for US", async () => {
    const { ctx, eventCtx } = createContext(DEFAULT_BASE_URL, { country: "US" });

    const response = await onRequest(eventCtx);
    await waitOnExecutionContext(ctx);

    expect(response.status).toBe(200);
  });

  it("get supported gift cards for any country", async () => {
    const chance = new Chance();
    const country = chance.country();
    const { ctx, eventCtx } = createContext(DEFAULT_BASE_URL, { country });

    const response = await onRequest(eventCtx);
    await waitOnExecutionContext(ctx);

    expect(response.status, `No cards found for ${country}`).toBe(200);
  });
});

describe("Post order helpers", () => {
  it("VISA gift cards from random country", async () => {
    const accessToken = await getAccessToken(env);
    const chance = new Chance();
    const country = chance.country();
    const productQuery = "visa";
    const cards = await getGiftCards(productQuery, country, accessToken);
    expect(cards.length, `No ${productQuery} cards for ${country} country`).toBeGreaterThan(0);
  });

  it("MasterCard gift cards from random country", async () => {
    const accessToken = await getAccessToken(env);
    const chance = new Chance();
    const country = chance.country();
    const productQuery = "mastercard";
    const cards = await getGiftCards(productQuery, country, accessToken);
    expect(cards.length, `No ${productQuery} cards for ${country} country`).toBeGreaterThan(0);
  });

  it("any gift cards from random country", async () => {
    const accessToken = await getAccessToken(env);
    const chance = new Chance();
    const country = chance.country();
    const productQuery = "";
    const cards = await getGiftCards(productQuery, country, accessToken);
    expect(cards.length, `No cards for ${country} country`).toBeGreaterThan(0);
  });

  it("visa gift cards from US", async () => {
    const accessToken = await getAccessToken(env);
    const country = "US";
    const productQuery = "visa";
    const cards = await getGiftCards(productQuery, country, accessToken);
    console.log(cards);
    expect(cards.length, `No cards for ${country} country`).toBeGreaterThan(0);
  });
});
