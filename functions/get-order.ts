import { OrderTransaction } from "../shared/types";
import { commonHeaders, getAccessToken, getBaseUrl } from "./helpers";
import { AccessToken, Context, ReloadlyFailureResponse, ReloadlyGetTransactionResponse } from "./types";
import { validateEnvVars, validateRequestMethod } from "./validators";

export async function onRequest(ctx: Context): Promise<Response> {
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

    if (!reloadlyTransaction) {
      return Response.json("Order not found.", { status: 404 });
    } else if (reloadlyTransaction.status && reloadlyTransaction.status == "SUCCESSFUL") {
      return Response.json(reloadlyTransaction, { status: 200 });
    } else {
      return Response.json({ message: "There is no successful transaction for given order ID." }, { status: 404 });
    }
  } catch (error) {
    console.error("There was an error while processing your request.", error);
    return Response.json({ message: "There was an error while processing your request." }, { status: 500 });
  }
}

export async function getTransactionFromOrderId(orderId: string, accessToken: AccessToken): Promise<OrderTransaction> {
  const nowFormatted = new Date().toISOString().replace("T", " ").substring(0, 19); //// yyyy-mm-dd HH:mm:ss
  const oneYearAgo = new Date(new Date().setFullYear(new Date().getFullYear() - 1));
  const oneYearAgoFormatted = oneYearAgo.toISOString().replace("T", " ").substring(0, 19);

  const url = `${getBaseUrl(accessToken.isSandbox)}/reports/transactions?size=1&page=1&customIdentifier=${orderId}&startDate=${oneYearAgoFormatted}&endDate=${nowFormatted}`;
  console.log(`Retrieving transaction from ${url}`);
  const options = {
    method: "GET",
    headers: {
      ...commonHeaders,
      Authorization: `Bearer ${accessToken.token}`,
    },
  };

  const response = await fetch(url, options);
  const responseJson = await response.json();

  console.log("Response status", response.status);
  console.log(`Response from ${url}`, responseJson);

  if (response.status != 200) {
    throw new Error(
      `Error from Reloadly API: ${JSON.stringify({
        status: response.status,
        message: (responseJson as ReloadlyFailureResponse).message,
      })}`
    );
  }
  return (responseJson as ReloadlyGetTransactionResponse).content[0];
}
