import { createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { setupServer, SetupServerApi } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { onRequest as pagesFunction } from "../../functions/get-redeem-code";
import card from "../fixtures/get-redeem-code/card.json";
import { httpMocks } from "../fixtures/http-mocks";
import { createEventContext, TESTS_BASE_URL } from "./shared-utils";

describe("Get payment card redeem code", () => {
  let server: SetupServerApi;
  let execContext: ExecutionContext;

  beforeAll(() => {
    execContext = createExecutionContext();
    try {
      server = setupServer(...httpMocks);
      server.listen({ onUnhandledRequest: "error" });
    } catch (e) {
      console.log(`Error starting msw server: ${e}`);
    }
  });

  afterEach(() => {
    server.resetHandlers();
  });

  afterAll(() => {
    server.close();
  });

  it("should return redeem code", async () => {
    const transactionId = "38994";
    const signedMessage =
      "0x78870c5b97821f4d828d5fea945e331edb0c5938e0820910e7fccaead9179e3030a5d80e123c1e335005b4cc81dbd6509f1a31b71ee18074b8c70aeacad666351b";
    const wallet = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
    const permitSig = "0x4599c64a7e7556976972d50d961058280e752e1d824db0201305852e80601ed51e6a8bbb71047d09e8d4c75d450df1fc073c775426ee13f2006b8ad55ca2e49d1c";

    const request = new Request(
      `${TESTS_BASE_URL}/get-redeem-code?transactionId=${transactionId}&signedMessage=${signedMessage}&wallet=${wallet}&permitSig=${permitSig}`
    );
    const eventCtx = createEventContext(request, execContext);

    const response = await pagesFunction(eventCtx);
    await waitOnExecutionContext(execContext);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(card);
  });

  it("should not return redeem code to user who is not actual buyer", async () => {
    const transactionId = "38994";
    const signedMessage =
      "0xccfa5da9e3ef32b0be38ea7930e7624beec5d4f69d580d0b2ab28b8c0cb1a8cd752b22fe36cd77235f47754298ce1d80ba430c6f7aac67f34a120617a07b21951b";
    const wallet = "0xE97e3b59B9c58a691bdb40De1698Af5fF29C2D71";
    const permitSig = "0x4599c64a7e7556976972d50d961058280e752e1d824db0201305852e80601ed51e6a8bbb71047d09e8d4c75d450df1fc073c775426ee13f2006b8ad55ca2e49d1c";

    const request = new Request(
      `${TESTS_BASE_URL}/get-redeem-code?transactionId=${transactionId}&signedMessage=${signedMessage}&wallet=${wallet}&permitSig=${permitSig}`
    );
    const eventCtx = createEventContext(request, execContext);
    const response = await pagesFunction(eventCtx);
    await waitOnExecutionContext(execContext);
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ message: "Given details are not valid to redeem code." });
  });

  it("should return err when transaction id is empty", async () => {
    const transactionId = "";
    const signedMessage =
      "0x78870c5b97821f4d828d5fea945e331edb0c5938e0820910e7fccaead9179e3030a5d80e123c1e335005b4cc81dbd6509f1a31b71ee18074b8c70aeacad666351b";
    const wallet = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
    const permitSig = "0x4599c64a7e7556976972d50d961058280e752e1d824db0201305852e80601ed51e6a8bbb71047d09e8d4c75d450df1fc073c775426ee13f2006b8ad55ca2e49d1c";

    const request = new Request(
      `${TESTS_BASE_URL}/get-redeem-code?transactionId=${transactionId}&signedMessage=${signedMessage}&wallet=${wallet}&permitSig=${permitSig}`
    );
    const eventCtx = createEventContext(request, execContext);

    const response = await pagesFunction(eventCtx);
    await waitOnExecutionContext(execContext);
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ message: "Given details are not valid to redeem code." });
  });
});
