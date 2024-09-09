import { env, waitOnExecutionContext } from "cloudflare:test";
import { describe, it, expect } from "vitest";
import { onRequest, getRedeemCode } from "./get-redeem-code";
import { createContext, DEFAULT_BASE_URL } from "../vitest/helpers";
import { getAccessToken } from "./helpers";

describe("Get Order", () => {
  it("throws 404 for non-existent order", async () => {
    const transactionId = String(1);
    const signedMessage = "";
    const wallet = "";
    const permitSig = "";

    const { ctx, eventCtx } = createContext(DEFAULT_BASE_URL, { transactionId, signedMessage, wallet, permitSig });

    const response = await onRequest(eventCtx);
    await waitOnExecutionContext(ctx);

    expect(response.status).toBe(404);
    expect(await response.text()).toContain("Order not found");
  });
});

describe("Redeem code helper", () => {
  it("get redeem code for account and existing transaction", async () => {
    const transactionId = 1;
    const accessToken = await getAccessToken(env);
    void expect(() => getRedeemCode(transactionId, accessToken)).rejects.toThrowError(
      'Error from Reloadly API: {"status":401,"message":"Full authentication is required to access this resource"}'
    );
  });

  it("get redeem code for other account", async () => {
    const transactionId = 1;
    const accessToken = await getAccessToken(env);
    void expect(() => getRedeemCode(transactionId, accessToken)).rejects.toThrowError(
      'Error from Reloadly API: {"status":401,"message":"Full authentication is required to access this resource"}'
    );
  });

  it("get redeem code for account and inexistent transaction", async () => {
    const transactionId = 1;
    const accessToken = await getAccessToken(env);
    void expect(() => getRedeemCode(transactionId, accessToken)).rejects.toThrowError(
      'Error from Reloadly API: {"status":401,"mess":"Full authentication is required to access this resource"}'
    );
  });
});
