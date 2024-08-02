import { GiftCard } from "../shared/types";
import { commonHeaders, getAccessToken, getBaseUrl } from "./helpers";
import { AccessToken, Context, ReloadlyFailureResponse } from "./types";
import { validateEnvVars, validateRequestMethod } from "./validators";

export async function onRequest(ctx: Context): Promise<Response> {
  try {
    validateRequestMethod(ctx.request.method, "GET");
    validateEnvVars(ctx);

    const { searchParams } = new URL(ctx.request.url);
    const country = searchParams.get("country");

    if (!country) {
      throw new Error(`Invalid query parameters: ${{ country }}`);
    }

    const accessToken = await getAccessToken(ctx.env);
    const [masterCards, visaCards] = await Promise.all([getGiftCards("mastercard", country, accessToken), getGiftCards("visa", country, accessToken)]);

    const giftCards = [...masterCards, ...visaCards];

    if (giftCards.length) {
      return Response.json(giftCards, { status: 200 });
    }
    return Response.json({ message: "There are no gift cards available." }, { status: 404 });
  } catch (error) {
    console.error("There was an error while processing your request.", error);
    return Response.json({ message: "There was an error while processing your request." }, { status: 500 });
  }
}

async function getGiftCards(productQuery: string, country: string, accessToken: AccessToken): Promise<GiftCard[]> {
  const url = `${getBaseUrl(accessToken.isSandbox)}/countries/${country}/products?productName=${productQuery}`;
  console.log(`Retrieving gift cards from ${url}`);
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

  if (response.status == 404) {
    return [];
  }

  if (response.status != 200) {
    throw new Error(
      `Error from Reloadly API: ${JSON.stringify({
        status: response.status,
        message: (responseJson as ReloadlyFailureResponse).message,
      })}`
    );
  }

  return responseJson as GiftCard[];
}
