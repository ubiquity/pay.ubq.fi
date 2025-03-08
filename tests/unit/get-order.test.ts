import { createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { setupServer, SetupServerApi } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { onRequest as pagesFunction } from "../../functions/get-order";
import order from "../fixtures/get-order/order.json";
import { httpMocks } from "../fixtures/http-mocks";
import { createEventContext, TESTS_BASE_URL } from "./shared-utils";

describe("Get payment card order", () => {
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

  it("should respond with order details", async () => {
    const request = new Request(`${TESTS_BASE_URL}/get-order?orderId=0xd89d85e5f65499e03f85cf5d4e69d04ee04d959cc04f8aa6a9fccba52b3c6916`);
    const eventCtx = createEventContext(request, execContext);
    const response = await pagesFunction(eventCtx);
    await waitOnExecutionContext(execContext);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(order);
  });

  it("should respond with error for invalid order id", async () => {
    const request = new Request(`${TESTS_BASE_URL}/get-order?orderId=0xd89d85e5f65499e03f85cf5d4e69d04ee04d959cc04f8aa6a9fccba52b3c6917`);
    const eventCtx = createEventContext(request, execContext);
    const response = await pagesFunction(eventCtx);
    await waitOnExecutionContext(execContext);
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual("Order not found.");
  });
});
