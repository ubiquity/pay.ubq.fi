import { TransactionDescription } from "@ethersproject/abi";
import { JsonRpcProvider, TransactionReceipt, TransactionResponse } from "@ethersproject/providers";
import { createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { setupServer, SetupServerApi } from "msw/node";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, MockInstance, vi } from "vitest";
import { onRequest as pagesFunction } from "../../functions/post-order";
import { httpMocks } from "../fixtures/http-mocks";
import minedTxForMockedParse from "../fixtures/post-order/mined-tx-for-mocked-parse.json";
import minedTxNotPermit2 from "../fixtures/post-order/mined-tx-not-permit2.json";
import minedTxPermitExpired from "../fixtures/post-order/mined-tx-permit-expired.json";
import minedTxTooHigh from "../fixtures/post-order/mined-tx-too-high.json";
import minedTxTooLow from "../fixtures/post-order/mined-tx-too-low.json";
import minedTxUusd from "../fixtures/post-order/mined-tx-uusd.json";
import minedTxGeneric from "../fixtures/post-order/mined-tx.json";
import orderCard13959 from "../fixtures/post-order/order-card-13959.json";
import orderCard18732 from "../fixtures/post-order/order-card-18732.json";
import parsedTxUusdWrongMethod from "../fixtures/post-order/parsed-tx-uusd-wrong-method.json";
import parsedTxUusdWrongTreasury from "../fixtures/post-order/parsed-tx-uusd-wrong-treasury.json";
import parsedTxWrongMethod from "../fixtures/post-order/parsed-tx-wrong-method.json";
import parsedTxWrongToken from "../fixtures/post-order/parsed-tx-wrong-token.json";
import parsedTxWrongTreasury from "../fixtures/post-order/parsed-tx-wrong-treasury.json";
import receiptNotPermit2 from "../fixtures/post-order/receipt-not-permit2.json";
import receiptPermitExpired from "../fixtures/post-order/receipt-permit-expired.json";
import receiptTooHigh from "../fixtures/post-order/receipt-too-high.json";
import receiptTooLow from "../fixtures/post-order/receipt-too-low.json";
import receiptTxForMockedParse from "../fixtures/post-order/receipt-tx-for-mocked-parse.json";
import receiptUusd from "../fixtures/post-order/receipt-tx-uusd.json";
import receiptGeneric from "../fixtures/post-order/receipt.json";
import { createEventContext, TESTS_BASE_URL } from "./shared-utils";

describe("Post order for a payment card", () => {
  let server: SetupServerApi;
  let execContext: ExecutionContext;
  let consoleMock: MockInstance;
  const generalError = { message: "Transaction is not authorized to purchase gift card." };
  const uusd = "ubiquity-dollar";

  beforeAll(async () => {
    execContext = createExecutionContext();
    try {
      server = setupServer(...httpMocks);
      server.listen({ onUnhandledRequest: "error" });
    } catch (e) {
      console.log(`Error starting msw server: ${e}`);
    }
  });

  beforeEach(async () => {
    consoleMock = vi.spyOn(console, "error").mockImplementationOnce(() => undefined);
  });

  afterEach(() => {
    server.resetHandlers();
    vi.restoreAllMocks();
  });

  afterAll(() => {
    server.close();
  });

  it("should post order on production with permit", async () => {
    await initMocks();
    const request = new Request(`${TESTS_BASE_URL}/post-order`, {
      method: "POST",
      body: JSON.stringify({
        type: "permit",
        chainId: 31337,
        txHash: "0xac3485ce523faa13970412a89ef42d10939b44abd33cbcff1ed84cb566a3a3d5",
        productId: 18732,
        country: "US",
        signedMessage: "0xab1c86111f7f5062ac0c0d44e7008c20cd92f3455aaf026ca0a53838a3dfa4b77e088ae5faa0ee0ceab31340986dcd9cb031001e5d730f730c52c1c4cfb3de0a1b",
      }),
    }) as Request<unknown, IncomingRequestCfProperties<unknown>>;

    const eventCtx = createEventContext(request, execContext);
    const response = await pagesFunction(eventCtx);
    await waitOnExecutionContext(execContext);
    expect(await response.json()).toEqual(orderCard18732);
    expect(response.status).toBe(200);
  });

  it("should return err for ordering card that is not best suited", async () => {
    await initMocks();
    const request = new Request(`${TESTS_BASE_URL}/post-order`, {
      method: "POST",
      body: JSON.stringify({
        type: "permit",
        chainId: 31337,
        txHash: "0xac3485ce523faa13970412a89ef42d10939b44abd33cbcff1ed84cb566a3a3d5",
        productId: 18597,
        country: "US",
        signedMessage: "0x054114b71b08d0dbe6639a4810169a45591c96ebbba94f7540e1696499dd179418fe58c6e254fe84a99d19a04a502eefc990f88f8352a528f70cd54fe3a71a0b1c",
      }),
    }) as Request<unknown, IncomingRequestCfProperties<unknown>>;

    const eventCtx = createEventContext(request, execContext);
    const response = await pagesFunction(eventCtx);
    await waitOnExecutionContext(execContext);
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ message: "There was an error while processing your request." });
  });

  it("should return err for ordering card for unsupported blockchain", async () => {
    await initMocks();
    const request = new Request(`${TESTS_BASE_URL}/post-order`, {
      method: "POST",
      body: JSON.stringify({
        type: "permit",
        chainId: 25,
        txHash: "0xac3485ce523faa13970412a89ef42d10939b44abd33cbcff1ed84cb566a3a3d5",
        productId: 18597,
        country: "US",
        signedMessage: "0x3258313920dfac47c13307e46260495ef2cdac180889673f624107dc8b2c1d343767d6b6c5dac10d7e5c945a671bc0a3efa4060c47e0d44c447c1416a56edf911b",
      }),
    }) as Request<unknown, IncomingRequestCfProperties<unknown>>;

    const eventCtx = createEventContext(request, execContext);
    const response = await pagesFunction(eventCtx);
    await waitOnExecutionContext(execContext);
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ message: "Unsupported chain" });
  });

  it("should return err for ordering card with too low permit amount", async () => {
    await initMocks(receiptTooLow, minedTxTooLow);

    const request = new Request(`${TESTS_BASE_URL}/post-order`, {
      method: "POST",
      body: JSON.stringify({
        type: "permit",
        chainId: 31337,
        txHash: "0xf21e2ce3a5106c6ddd0d70c8925965878a2604ed042990be49b05773196bb6b4",
        productId: 18597,
        country: "US",
        signedMessage: "0x3a6739343e99cd712e80acecad93cdb30723854b1febc81ed5e70b1db464c49e69cc45621281bf85b85455ba5d98aeeaf043ef4bb4947d535a721de5c9bcc1251c",
      }),
    }) as Request<unknown, IncomingRequestCfProperties<unknown>>;

    const eventCtx = createEventContext(request, execContext);
    const response = await pagesFunction(eventCtx);
    await waitOnExecutionContext(execContext);
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ message: "Your reward amount is either too high or too low to buy this card." });
  });

  it("should return err for ordering card with too high permit amount", async () => {
    await initMocks(receiptTooHigh, minedTxTooHigh);

    const request = new Request(`${TESTS_BASE_URL}/post-order`, {
      method: "POST",
      body: JSON.stringify({
        type: "permit",
        chainId: 31337,
        txHash: "0x9c9fd8cde45957741c16f0af4ab191d9b010c6f95d351df8c023e14a2ac80aa2",
        productId: 18597,
        country: "US",
        signedMessage: "0x7a032fcf8746edc43502fe8264780d64df5a39e3d27716fef522d8bf2103521f5ec2c00ba43538247fd58c6ff63825f262b09f6f7edca5b4dcbf006b19fa0f761b",
      }),
    }) as Request<unknown, IncomingRequestCfProperties<unknown>>;

    const eventCtx = createEventContext(request, execContext);
    const response = await pagesFunction(eventCtx);
    await waitOnExecutionContext(execContext);
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ message: "Your reward amount is either too high or too low to buy this card." });
  });

  it("should return err for ordering card with expired permit", async () => {
    await initMocks(receiptPermitExpired, minedTxPermitExpired);
    const request = new Request(`${TESTS_BASE_URL}/post-order`, {
      method: "POST",
      body: JSON.stringify({
        type: "permit",
        chainId: 31337,
        txHash: "0xfac827e7448c6578f7a22f7f90ec64693ef54238164d50dd895567f382d3c0bb",
        productId: 18597,
        country: "US",
        signedMessage: "0x1777a5bdb58d568f2d8bf7db8e248895097fa28d56f1bb89b098cbb20bf88cf1394efa20212beb0ed8d4c11fa43f52186c180b96e0ab2265f019b0d14e50ce9c1b",
      }),
    }) as Request<unknown, IncomingRequestCfProperties<unknown>>;

    const eventCtx = createEventContext(request, execContext);
    const response = await pagesFunction(eventCtx);
    await waitOnExecutionContext(execContext);
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ message: "The reward has expired." });
  });

  it("should return err for missing signed message", async () => {
    await initMocks();
    const request = new Request(`${TESTS_BASE_URL}/post-order`, {
      method: "POST",
      body: JSON.stringify({
        type: "permit",
        chainId: 31337,
        txHash: "0xac3485ce523faa13970412a89ef42d10939b44abd33cbcff1ed84cb566a3a3d5",
        productId: 18597,
        country: "US",
        signedMessage: "",
      }),
    }) as Request<unknown, IncomingRequestCfProperties<unknown>>;

    const eventCtx = createEventContext(request, execContext);
    const response = await pagesFunction(eventCtx);
    await waitOnExecutionContext(execContext);
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ message: "Signed message is missing in the request." });
  });

  it("should return err for invalid signed message", async () => {
    await initMocks();
    const request = new Request(`${TESTS_BASE_URL}/post-order`, {
      method: "POST",
      body: JSON.stringify({
        type: "permit",
        chainId: 31337,
        txHash: "0xac3485ce523faa13970412a89ef42d10939b44abd33cbcff1ed84cb566a3a3d5",
        productId: 18597,
        country: "US",
        signedMessage: "0x1777a5bdb58d568f2d8bf7db8e248895097fa28d56f1bb89b098cbb20bf88cf1394efa20212beb0ed8d4c11fa43f52186c180b96e0ab2265f019b0d14e50ce9c1b",
      }),
    }) as Request<unknown, IncomingRequestCfProperties<unknown>>;

    const eventCtx = createEventContext(request, execContext);
    const response = await pagesFunction(eventCtx);
    await waitOnExecutionContext(execContext);
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ message: "You have provided invalid signed message." });
  });

  it("should return err order with tx hash that not permit2 interaction", async () => {
    await initMocks(receiptNotPermit2, minedTxNotPermit2);

    const request = new Request(`${TESTS_BASE_URL}/post-order`, {
      method: "POST",
      body: JSON.stringify({
        type: "permit",
        chainId: 31337,
        txHash: "0xfac827e7448c6578f7a22f7f90ec64693ef54238164d50dd895567f382d3c0bb",
        productId: 18597,
        country: "US",
        signedMessage: "0x1777a5bdb58d568f2d8bf7db8e248895097fa28d56f1bb89b098cbb20bf88cf1394efa20212beb0ed8d4c11fa43f52186c180b96e0ab2265f019b0d14e50ce9c1b",
      }),
    }) as Request<unknown, IncomingRequestCfProperties<unknown>>;

    const eventCtx = createEventContext(request, execContext);
    const response = await pagesFunction(eventCtx);
    await waitOnExecutionContext(execContext);
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual(generalError);
    expect(consoleMock).toHaveBeenLastCalledWith(
      "Given transaction hash is not an interaction with permit2Address",
      "txReceipt.to=0xC6ed4f520f6A4e4DC27273509239b7F8A68d2068",
      "permit2Address=0x000000000022D473030F116dDEE9F6B43aC78BA3"
    );
  });

  it("should return error with tx hash that is not call to permitTransferFrom", async () => {
    await initMocks(receiptTxForMockedParse, minedTxForMockedParse, parsedTxWrongMethod);

    const request = new Request(`${TESTS_BASE_URL}/post-order`, {
      method: "POST",
      body: JSON.stringify({
        type: "permit",
        chainId: 31337,
        txHash: "0xbef4c18032fbef0453f85191fb0fa91184b42d12ccc37f00eb7ae8c1d88a0233",
        productId: 18597,
        country: "US",
        signedMessage: "0x3d436ff563e82f81c77fd69a9f484c90059b06a6e2b1bafacec8f2a55021b28b0f39cdab7729545499fd489e2a01b3faec39d44b47cde247cb5082c46a6e94971b",
      }),
    }) as Request<unknown, IncomingRequestCfProperties<unknown>>;

    const eventCtx = createEventContext(request, execContext);
    const response = await pagesFunction(eventCtx);
    await waitOnExecutionContext(execContext);
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual(generalError);
    expect(consoleMock).toHaveBeenLastCalledWith(
      "Given transaction hash is not call to contract function permitTransferFrom",
      "txParsed.functionFragment.name=permitTransferFromEdited"
    );
  });

  it("should return error with tx hash that transfers wrong token", async () => {
    await initMocks(receiptTxForMockedParse, minedTxForMockedParse, parsedTxWrongToken);

    const request = new Request(`${TESTS_BASE_URL}/post-order`, {
      method: "POST",
      body: JSON.stringify({
        type: "permit",
        chainId: 31337,
        txHash: "0xbef4c18032fbef0453f85191fb0fa91184b42d12ccc37f00eb7ae8c1d88a0233",
        productId: 18597,
        country: "US",
        signedMessage: "0x3d436ff563e82f81c77fd69a9f484c90059b06a6e2b1bafacec8f2a55021b28b0f39cdab7729545499fd489e2a01b3faec39d44b47cde247cb5082c46a6e94971b",
      }),
    }) as Request<unknown, IncomingRequestCfProperties<unknown>>;

    const eventCtx = createEventContext(request, execContext);
    const response = await pagesFunction(eventCtx);
    await waitOnExecutionContext(execContext);
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual(generalError);
    expect(consoleMock).toHaveBeenLastCalledWith(
      "Given transaction hash is not transferring the required ERC20 token.",
      '{"transferredToken":"0x4ECaBa5870353805a9F068101A40E0f32ed605C6","requiredToken":"0xC6ed4f520f6A4e4DC27273509239b7F8A68d2068"}'
    );
  });

  it("should return error with tx hash that transfers to wrong treasury", async () => {
    await initMocks(receiptTxForMockedParse, minedTxForMockedParse, parsedTxWrongTreasury);
    const request = new Request(`${TESTS_BASE_URL}/post-order`, {
      method: "POST",
      body: JSON.stringify({
        type: "permit",
        chainId: 31337,
        txHash: "0xbef4c18032fbef0453f85191fb0fa91184b42d12ccc37f00eb7ae8c1d88a0233",
        productId: 18597,
        country: "US",
        signedMessage: "0x3d436ff563e82f81c77fd69a9f484c90059b06a6e2b1bafacec8f2a55021b28b0f39cdab7729545499fd489e2a01b3faec39d44b47cde247cb5082c46a6e94971b",
      }),
    }) as Request<unknown, IncomingRequestCfProperties<unknown>>;

    const eventCtx = createEventContext(request, execContext);
    const response = await pagesFunction(eventCtx);
    await waitOnExecutionContext(execContext);
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual(generalError);

    expect(consoleMock).toHaveBeenLastCalledWith(
      "Given transaction hash is not a token transfer to giftCardTreasuryAddress",
      "txParsed.args.transferDetails.to=0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
      "giftCardTreasuryAddress=0xD51B09ad92e08B962c994374F4e417d4AD435189"
    );
  });

  it("should post order with uusd", async () => {
    await initMocks(receiptUusd, minedTxUusd);
    const request = new Request(`${TESTS_BASE_URL}/post-order`, {
      method: "POST",
      body: JSON.stringify({
        type: uusd,
        chainId: 31337,
        txHash: "0xdf1bf8b6d679e406f43b57692a2dcbb450e38d5de72e5199d836b701d0a4306f",
        productId: 18732,
        country: "US",
      }),
    }) as Request<unknown, IncomingRequestCfProperties<unknown>>;

    const eventCtx = createEventContext(request, execContext);
    const response = await pagesFunction(eventCtx);
    await waitOnExecutionContext(execContext);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(orderCard18732);
  });

  it("should return err with uusd for unsupported chain", async () => {
    await initMocks(receiptUusd, minedTxUusd);
    const request = new Request(`${TESTS_BASE_URL}/post-order`, {
      method: "POST",
      body: JSON.stringify({
        type: uusd,
        chainId: 25,
        txHash: "0xdf1bf8b6d679e406f43b57692a2dcbb450e38d5de72e5199d836b701d0a4306f",
        productId: 18597,
        country: "US",
      }),
    }) as Request<unknown, IncomingRequestCfProperties<unknown>>;

    const eventCtx = createEventContext(request, execContext);
    const response = await pagesFunction(eventCtx);
    await waitOnExecutionContext(execContext);
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ message: "Unsupported chain" });
  });

  it("should return err with uusd for wrong method call", async () => {
    await initMocks(receiptUusd, minedTxUusd, parsedTxUusdWrongMethod);
    const request = new Request(`${TESTS_BASE_URL}/post-order`, {
      method: "POST",
      body: JSON.stringify({
        type: uusd,
        chainId: 31337,
        txHash: "0xdf1bf8b6d679e406f43b57692a2dcbb450e38d5de72e5199d836b701d0a4306f",
        productId: 18597,
        country: "US",
      }),
    }) as Request<unknown, IncomingRequestCfProperties<unknown>>;

    const eventCtx = createEventContext(request, execContext);
    const response = await pagesFunction(eventCtx);
    await waitOnExecutionContext(execContext);
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ message: "Given transaction is not a token transfer" });
  });

  it("should return err with uusd for wrong treasury", async () => {
    await initMocks(receiptUusd, minedTxUusd, parsedTxUusdWrongTreasury);
    const request = new Request(`${TESTS_BASE_URL}/post-order`, {
      method: "POST",
      body: JSON.stringify({
        type: uusd,
        chainId: 31337,
        txHash: "0xdf1bf8b6d679e406f43b57692a2dcbb450e38d5de72e5199d836b701d0a4306f",
        productId: 18597,
        country: "US",
      }),
    }) as Request<unknown, IncomingRequestCfProperties<unknown>>;

    const eventCtx = createEventContext(request, execContext);
    const response = await pagesFunction(eventCtx);
    await waitOnExecutionContext(execContext);
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ message: "Given transaction is not a token transfer to treasury address" });
  });

  it("should post order on sandbox with uusd", async () => {
    await initMocks(receiptUusd, minedTxUusd);
    const request = new Request(`${TESTS_BASE_URL}/post-order`, {
      method: "POST",
      body: JSON.stringify({
        type: uusd,
        chainId: 31337,
        txHash: "0xdf1bf8b6d679e406f43b57692a2dcbb450e38d5de72e5199d836b701d0a4306f",
        productId: 13959,
        country: "US",
      }),
    }) as Request<unknown, IncomingRequestCfProperties<unknown>>;

    const eventCtx = createEventContext(request, execContext, true);
    const response = await pagesFunction(eventCtx);
    await waitOnExecutionContext(execContext);

    expect(await response.json()).toEqual(orderCard13959);
    expect(response.status).toBe(200);
  });

  it("should post order on sandbox", async () => {
    await initMocks();
    const request = new Request(`${TESTS_BASE_URL}/post-order`, {
      method: "POST",
      body: JSON.stringify({
        type: "permit",
        chainId: 31337,
        txHash: "0xac3485ce523faa13970412a89ef42d10939b44abd33cbcff1ed84cb566a3a3d5",
        productId: 13959,
        country: "US",
        signedMessage: "0x3d73c9509e8cbf15557046e4071a35ec7aa55b36015288a45dbbd9bcad5eb2b46799d7475759d353490d792a9e6fd66d559e1234b9c45910c526e0ae86b0f52d1c",
      }),
    }) as Request<unknown, IncomingRequestCfProperties<unknown>>;

    const eventCtx = createEventContext(request, execContext, true);
    const response = await pagesFunction(eventCtx);
    await waitOnExecutionContext(execContext);

    expect(await response.json()).toEqual(orderCard13959);
    expect(response.status).toBe(200);
  });
});

async function initMocks(receipt: object = receiptGeneric, minedTx: object = minedTxGeneric, parsedTx?: object) {
  const rpcHandler = await import("../../shared/use-rpc-handler");

  vi.spyOn(rpcHandler, "useRpcHandler").mockImplementationOnce(async () => {
    return new JsonRpcProvider("http://127.0.0.1:8545/");
  });

  const providers = await import("@ethersproject/providers");

  vi.spyOn(providers.JsonRpcProvider.prototype, "getTransactionReceipt").mockImplementationOnce(async () => {
    return receipt as TransactionReceipt;
  });
  vi.spyOn(providers.JsonRpcProvider.prototype, "getTransaction").mockImplementationOnce(async () => {
    return minedTx as TransactionResponse;
  });

  if (parsedTx) {
    const { Interface } = await import("@ethersproject/abi");
    vi.spyOn(Interface.prototype, "parseTransaction").mockImplementationOnce(() => {
      return parsedTx as TransactionDescription;
    });
  }
}
