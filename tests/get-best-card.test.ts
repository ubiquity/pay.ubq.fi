import { env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { describe, it, expect } from "vitest";
import { onRequest as pagesFunction } from "../functions/get-best-card";

describe(
  "Get best virtual card",
  () => {
    it("should respond with correct virtual card", async () => {
      // Create an empty context to pass to `worker.fetch()`
      const execContext = createExecutionContext();
      const eventCtx = getEventContext(execContext);
      const response = await pagesFunction(eventCtx);
      await waitOnExecutionContext(execContext);
      expect(response.status).toBe(200);
      expect(await response.text()).toBe(JSON.stringify(expectedResponse));
    });
  },
  { timeout: 20000 }
);

const expectedResponse = {
  productId: 13959,
  productName: "Vanilla® eGift Visa",
  global: false,
  supportsPreOrder: true,
  senderFee: 6,
  senderFeePercentage: 0,
  discountPercentage: 0,
  denominationType: "RANGE",
  recipientCurrencyCode: "USD",
  minRecipientDenomination: 20,
  maxRecipientDenomination: 100,
  senderCurrencyCode: "USD",
  minSenderDenomination: 20,
  maxSenderDenomination: 100,
  fixedRecipientDenominations: [],
  fixedSenderDenominations: null,
  fixedRecipientToSenderDenominationsMap: null,
  metadata: null,
  logoUrls: ["https://cdn.reloadly.com/giftcards/cdf0a915-a88d-4eb5-8cb8-a4fd00accc7eVanilla.jpg"],
  brand: { brandId: 95, brandName: "Vanilla® eGift Visa" },
  category: { id: 1, name: "Payment Cards" },
  country: { isoName: "US", name: "United States", flagUrl: "https://s3.amazonaws.com/rld-flags/us.svg" },
  redeemInstruction: {
    concise: "To redeem, visit yourrewardcard.com",
    verbose:
      "Virtual Account is a prepaid Virtual Account loaded by the Corporate Sponsor, redeemable to buy goods and services anywhere Visa debit Virtual Accounts are accepted, as described in the Virtual Account Use and Fees section. The Virtual Account is NOT a credit card. The Virtual Account is not a checking account or connected in any way to any account other than a stored value account where your funds are held. The expiration date of the Virtual Account and the Virtual Account funds is identified on the Virtual Account. &#13;eReward Visa Virtual Accountholder Agreement CUSTOMER SERVICE CONTACT INFORMATION: &#13;Address: P.O. Box 826 Fortson, GA 31808 &#13;Website: YourRewardCard.com &#13;Phone Number: 1-833-634-3155",
  },
};

function getEventContext(execContext: ExecutionContext) {
  const request = new Request("http://localhost/get-best-card?country=US&amount=50000000000000000000");

  const params = { slug: "hello" };
  const data = {};
  const eventCtx: Parameters<typeof pagesFunction>[0] = {
    request,
    functionPath: "",
    waitUntil: execContext.waitUntil.bind(execContext),
    passThroughOnException: execContext.passThroughOnException.bind(execContext),
    async next(input, init) {
      const request = new Request(input ?? "http://placeholder", init);
      return new Response(`next:${request.method} ${request.url}`);
    },
    env: {
      ...env,
      ASSETS: {
        async fetch(input, init) {
          const request = new Request(input, init);
          return new Response(`ASSETS:${request.method} ${request.url}`);
        },
      },
    },
    params,
    data,
  };

  return eventCtx;
}
