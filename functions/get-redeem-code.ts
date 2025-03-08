import { verifyMessage } from "@ethersproject/wallet";
import { getGiftCardOrderId, getRevealMessageToSign } from "../shared/helpers";
import { getRedeemCodeParamsSchema } from "../shared/api-types";
import { getTransactionFromOrderId } from "./get-order";
import { commonHeaders, getAccessToken, getReloadlyApiBaseUrl } from "./utils/shared";
import { AccessToken, Context, ReloadlyFailureResponse, ReloadlyRedeemCodeResponse } from "./utils/types";
import { validateEnvVars, validateRequestMethod } from "./utils/validators";
import { RedeemCode } from "../shared/types";

export async function onRequest(ctx: Context): Promise<Response> {
  try {
    validateRequestMethod(ctx.request.method, "GET");
    validateEnvVars(ctx);

    const accessToken = await getAccessToken(ctx.env);

    const { searchParams } = new URL(ctx.request.url);

    const result = getRedeemCodeParamsSchema.safeParse({
      transactionId: searchParams.get("transactionId"),
      signedMessage: searchParams.get("signedMessage"),
      wallet: searchParams.get("wallet"),
      permitSig: searchParams.get("permitSig"),
    });
    if (!result.success) {
      throw new Error(`Invalid parameters: ${JSON.stringify(result.error.errors)}`);
    }
    const { transactionId, signedMessage, wallet, permitSig } = result.data;

    const errorResponse = Response.json({ message: "Given details are not valid to redeem code." }, { status: 403 });

    if (verifyMessage(getRevealMessageToSign(transactionId), signedMessage) != wallet) {
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

    if (order?.transactionId != transactionId) {
      console.error(
        `Given transaction does not match with retrieved transactionId using generated orderId: ${JSON.stringify({
          transactionId,
          orderId,
          transactionIdFromOrder: order?.transactionId,
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
}

export async function getRedeemCode(transactionId: number, accessToken: AccessToken): Promise<RedeemCode[]> {
  const url = `${getReloadlyApiBaseUrl(accessToken.isSandbox)}/orders/transactions/${transactionId}/cards`;
  console.log(`Retrieving redeem codes from ${url}`);
  const options = {
    method: "GET",
    headers: {
      ...commonHeaders,
      Authorization: `Bearer ${accessToken.token}`,
    },
  };

  const response = await fetch(url, options);
  const responseJson = await response.json();

  if (response.status != 200) {
    throw new Error(
      `Error from Reloadly API: ${JSON.stringify({
        status: response.status,
        message: (responseJson as ReloadlyFailureResponse).message,
      })}`
    );
  }
  console.log("Response status", response.status);
  console.log(`Response from ${url}`, responseJson);

  return responseJson as ReloadlyRedeemCodeResponse;
}
