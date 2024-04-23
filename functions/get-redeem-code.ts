import { Env, getAccessToken, getBaseUrl, getGiftCardOrderId, getMessageToSign } from "../shared/helpers";
import { AccessToken, NotOkReloadlyApiResponse, ReloadlyRedeemCodeResponse } from "../shared/types";
import { verifyMessage } from "ethers/lib/utils";
import { getTransactionFromOrderId } from "./get-order";
import { validateEnvVars, validateRequestMethod } from "./validators";

export const onRequest: PagesFunction<Env> = async (ctx) => {
  try {
    validateRequestMethod(ctx.request.method, "GET");
    validateEnvVars(ctx);

    const accessToken = await getAccessToken(ctx.env);

    const { searchParams } = new URL(ctx.request.url);
    const transactionId = Number(searchParams.get("transactionId"));
    const signedMessage = searchParams.get("signedMessage");
    const wallet = searchParams.get("wallet");
    const permitSig = searchParams.get("permitSig");

    if (isNaN(transactionId) || !(transactionId && signedMessage && wallet && permitSig)) {
      throw new Error(
        `Invalid query parameters: ${{
          transactionId,
          signedMessage,
          wallet,
          permitSig,
        }}`
      );
    }

    const errorResponse = Response.json({ message: "Given details are not valid to redeem code." }, { status: 403 });

    if (verifyMessage(getMessageToSign(transactionId), signedMessage) != wallet) {
      console.error(
        `Signed message verification failed: ${JSON.stringify({
          signedMessage,
          transactionId,
        })}`
      );
      return errorResponse;
    }

    const orderId = getGiftCardOrderId(wallet, permitSig);
    const order = await getTransactionFromOrderId(orderId, accessToken);

    if (order.transactionId != transactionId) {
      console.error(
        `Given transaction does not match with retrieved transactionId using generated orderId: ${JSON.stringify({
          transactionId,
          orderId,
          transactionIdFromOrder: order.transactionId,
        })}`
      );
      return errorResponse;
    }

    const redeemCode = await getRedeemCode(transactionId, accessToken);
    return Response.json(redeemCode, { status: 200 });
  } catch (error) {
    console.error("There was an error while processing your request.", error);
    return Response.json({ message: "There was an error while processing your request." }, { status: 500 });
  }
};

export const getRedeemCode = async (transactionId: number, accessToken: AccessToken) => {
  const url = `${getBaseUrl(accessToken.isSandbox)}/orders/transactions/${transactionId}/cards`;
  console.log(`Retrieving redeem codes from ${url}`);
  const options = {
    method: "GET",
    headers: {
      Accept: "application/com.reloadly.giftcards-v1+json",
      Authorization: `Bearer ${accessToken.token}`,
    },
  };

  const response = await fetch(url, options);
  const responseJson = await response.json();

  if (response.status != 200) {
    throw new Error(
      `Error from Reloadly API: ${JSON.stringify({
        status: response.status,
        message: (responseJson as NotOkReloadlyApiResponse).message,
      })}`
    );
  }
  console.log("Response status", response.status);
  console.log(`Response from ${url}`, responseJson);

  return responseJson as ReloadlyRedeemCodeResponse;
};
