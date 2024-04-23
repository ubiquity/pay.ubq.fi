import { Env, getAccessToken, getBaseUrl } from "../shared/helpers";
import { AccessToken, NotOkReloadlyApiResponse, ReloadlyGetTransactionResponse } from "../shared/types";
import { validateEnvVars, validateRequestMethod } from "./validators";

export const onRequest: PagesFunction<Env> = async (ctx) => {
  try {
    validateRequestMethod(ctx.request.method, "GET");
    validateEnvVars(ctx);

    const { searchParams } = new URL(ctx.request.url);
    const orderId = searchParams.get("orderId");

    if (!orderId) {
      throw new Error(`Invalid query parameters: ${{ orderId }}`);
    }

    const accessToken = await getAccessToken(ctx.env);

    const reloadlyTransaction = await getTransactionFromOrderId(orderId, accessToken);

    if (reloadlyTransaction.status == "SUCCESSFUL") {
      return Response.json(reloadlyTransaction, { status: 200 });
    } else {
      return Response.json({ message: "There is no successful transaction for given order ID." }, { status: 404 });
    }
  } catch (error) {
    console.error("There was an error while processing your request.", error);
    return Response.json({ message: "There was an error while processing your request." }, { status: 500 });
  }
};

export const getTransactionFromOrderId = async (orderId: string, accessToken: AccessToken) => {
  const url = `${getBaseUrl(accessToken.isSandbox)}/reports/transactions?size=1&page=1&customIdentifier=${orderId}`;
  console.log(`Retrieving transaction from ${url}`);
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
  return (responseJson as ReloadlyGetTransactionResponse).content[0];
};
