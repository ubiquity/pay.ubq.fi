import { http, HttpResponse } from "msw";
import bestCardSandbox from "./get-best-card/best-card-sandbox.json";
import bestMastercardProd from "./get-best-card/best-master-card-prod.json";
import bestVisaProd from "./get-best-card/best-visa-card-prod.json";
import card18597 from "./get-best-card/card-18597.json";
import card18732 from "./post-order/card-18732.json";
import card18598 from "./get-best-card/card-18598.json";
import noCardMt from "./get-best-card/no-card-mt.json";
import transaction from "./get-order/transaction.json";
import noTransaction from "./get-order/no-transaction.json";
import transaction0x33f4 from "./get-redeem-code/transaction-0x33f4.json";
import card from "./get-redeem-code/card.json";
import orderCard13959 from "./post-order/order-card-13959.json";
import orderCard18732 from "./post-order/order-card-18732.json";
import { RELOADLY_AUTH_URL, RELOADLY_PRODUCTION_API_URL, RELOADLY_SANDBOX_API_URL } from "../../functions/utils/shared";

/**
 * Intercepts the routes and returns a custom payload
 */
export const httpMocks = [
  http.post(RELOADLY_AUTH_URL, () => {
    return HttpResponse.json({ access_token: "fooBar" });
  }),
  http.get(`${RELOADLY_PRODUCTION_API_URL}/products/18732`, () => {
    return HttpResponse.json(card18732, { status: 200 });
  }),
  http.get(`${RELOADLY_PRODUCTION_API_URL}/products/18597`, () => {
    return HttpResponse.json(card18597, { status: 200 });
  }),
  http.get(`${RELOADLY_PRODUCTION_API_URL}/products/18598`, () => {
    return HttpResponse.json(card18598, { status: 200 });
  }),
  http.get(`${RELOADLY_SANDBOX_API_URL}/products`, ({ request }) => {
    const url = new URL(request.url);
    const productName = url.searchParams.get("productName");
    if (productName == "visa") {
      return HttpResponse.json({ content: [bestCardSandbox] }, { status: 200 });
    }
    return HttpResponse.json({ content: [] }, { status: 200 });
  }),
  http.get(`${RELOADLY_PRODUCTION_API_URL}/countries/US/products`, ({ request }) => {
    const url = new URL(request.url);
    const productName = url.searchParams.get("productName");

    if (productName == "mastercard") {
      return HttpResponse.json(bestMastercardProd, { status: 200 });
    }
    if (productName == "visa") {
      return HttpResponse.json(bestVisaProd, { status: 200 });
    }
    return HttpResponse.json([], { status: 200 });
  }),

  http.get(`${RELOADLY_PRODUCTION_API_URL}/countries/MT/products`, () => {
    return HttpResponse.json(noCardMt, { status: 404 });
  }),

  http.get(`${RELOADLY_PRODUCTION_API_URL}/orders/transactions/38994/cards`, () => {
    return HttpResponse.json(card, { status: 200 });
  }),

  http.get(`${RELOADLY_PRODUCTION_API_URL}/reports/transactions`, ({ request }) => {
    const url = new URL(request.url);
    const customIdentifier = url.searchParams.get("customIdentifier");

    if (customIdentifier == "0xd89d85e5f65499e03f85cf5d4e69d04ee04d959cc04f8aa6a9fccba52b3c6916") {
      return HttpResponse.json(transaction, { status: 200 });
    } else if (customIdentifier == "0x33f4b8ad8a2d0dda3869566a065602a3d20a31f8ed723013653a5d26a994ceef") {
      return HttpResponse.json(transaction0x33f4, { status: 200 });
    }

    return HttpResponse.json(noTransaction, { status: 200 });
  }),

  http.post(`${RELOADLY_PRODUCTION_API_URL}/orders`, () => {
    return HttpResponse.json(orderCard18732, { status: 200 });
  }),
  http.post(`${RELOADLY_SANDBOX_API_URL}/orders`, () => {
    return HttpResponse.json(orderCard13959, { status: 200 });
  }),

  http.get(`${RELOADLY_PRODUCTION_API_URL}/products/13959`, () => {
    return HttpResponse.json(bestCardSandbox, { status: 200 });
  }),

  http.get(`${RELOADLY_PRODUCTION_API_URL}/products/18732`, () => {
    return HttpResponse.json(card18732, { status: 200 });
  }),

  http.get(`${RELOADLY_SANDBOX_API_URL}/products/13959`, () => {
    return HttpResponse.json(bestCardSandbox, { status: 200 });
  }),

  http.get(`${RELOADLY_SANDBOX_API_URL}/reports/transactions`, () => {
    return HttpResponse.json(noTransaction, { status: 200 });
  }),
];
