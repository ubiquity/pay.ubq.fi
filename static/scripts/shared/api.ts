import { ReloadlyOrderResponse } from "../../../functions/utils/types";
import { GetBestCardParams, GetOrderParams, GetRedeemCodeParams, PostOrderParams } from "../../../shared/api-types";
import { GiftCard, OrderTransaction, RedeemCode } from "../../../shared/types";
import { getApiBaseUrl } from "../rewards/gift-cards/helpers";

export async function getBestCard(params: GetBestCardParams) {
  const url = `${getApiBaseUrl()}/get-best-card?country=${params.country}&amount=${params.amount}`;

  const response = await fetch(url, {
    method: "GET",
    headers: {
      Accept: "application/json",
    },
  });

  if (response.status != 200) {
    return null;
  }

  return (await response.json()) as GiftCard;
}

export async function getOrder(params: GetOrderParams) {
  const retrieveOrderUrl = `${getApiBaseUrl()}/get-order?orderId=${params.orderId}`;
  const response = await fetch(retrieveOrderUrl, {
    method: "GET",
    headers: {
      Accept: "application/json",
    },
  });

  if (response.status != 200) {
    return null;
  }

  const { transaction, product } = (await response.json()) as {
    transaction: OrderTransaction;
    product: GiftCard | null;
  };

  return { transaction, product };
}

export async function postOrder(params: PostOrderParams) {
  const url = `${getApiBaseUrl()}/post-order`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(params),
  });

  if (response.status != 200) {
    return null;
  }

  return (await response.json()) as ReloadlyOrderResponse;
}

export async function getRedeemCode(params: GetRedeemCodeParams) {
  const response = await fetch(
    `${getApiBaseUrl()}/get-redeem-code?transactionId=${params.transactionId}&signedMessage=${params.signedMessage}&wallet=${params.wallet}&permitSig=${params.permitSig}`,
    {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
    }
  );

  if (response.status != 200) {
    return null;
  }

  return (await response.json()) as RedeemCode[];
}
