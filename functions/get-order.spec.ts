import { env, waitOnExecutionContext } from "cloudflare:test";
import { describe, it, expect } from "vitest";
import { onRequest, getTransactionFromOrderId } from "./get-order";
import { getAccessToken } from "./helpers";
import { createContext, DEFAULT_BASE_URL } from "../vitest/helpers";

describe("Get Order", () => {
  it("throws 404 for non-existent order", async () => {
    const { ctx, eventCtx } = createContext(DEFAULT_BASE_URL, { orderId: "1" });

    const response = await onRequest(eventCtx);
    await waitOnExecutionContext(ctx);

    expect(response.status).toBe(404);
    expect(await response.text()).toContain("Order not found");
  });

  it("throws 500 for missing order id", async () => {
    const { ctx, eventCtx } = createContext(DEFAULT_BASE_URL, {});

    const response = await onRequest(eventCtx);
    await waitOnExecutionContext(ctx);
    expect(response.status).toBe(500);
    expect(await response.text()).toContain("There was an error while processing your request");
  });

  it("throws 404 for non-existent order", async () => {
    const { ctx, eventCtx } = createContext(DEFAULT_BASE_URL, { orderId: "1" });

    const response = await onRequest(eventCtx);
    await waitOnExecutionContext(ctx);
    expect(response.status).toBe(404);
  });
  it.skip("found existing but unsuccessfull transaction", async () => {
    const { ctx, eventCtx } = createContext(DEFAULT_BASE_URL, { orderId: "1" });

    const response = await onRequest(eventCtx);
    await waitOnExecutionContext(ctx);
    expect(response.status).toBe(404);
  });

  it.skip("found existing and successful transaction", async () => {
    // TODO
    const existingSuccessfulTransaction = { id: "asd" };
    const { ctx, eventCtx } = createContext(DEFAULT_BASE_URL, { orderId: existingSuccessfulTransaction.id });

    const response = await onRequest(eventCtx);
    await waitOnExecutionContext(ctx);
    expect(response.status).toBe(404);
  });
});

describe("Get order helpers", () => {
  it("wrong credentials", async () => {
    void expect(() => getTransactionFromOrderId("asd", { token: "token", isSandbox: true })).rejects.toThrowError(
      'Error from Reloadly API: {"status":401,"message":"Full authentication is required to access this resource"}'
    );
  });

  it("wrong mode (not sandbox)", async () => {
    const accessToken = await getAccessToken(env);
    void expect(() => getTransactionFromOrderId("asd", { token: accessToken.token, isSandbox: !accessToken.isSandbox })).rejects.toThrowError(
      'Error from Reloadly API: {"status":401,"message":"Invalid token, are you in production & using a sandbox token or vice-versa?"}'
    );
  });
});
