import { Env, getAccessToken, getBaseUrl } from "../shared/helpers";
import { AccessToken, NotOkReloadlyApiResponse, ReloadlyListGiftCardResponse } from "../shared/types";
import { validateEnvVars, validateRequestMethod } from "./validators";

export const onRequest: PagesFunction<Env> = async (ctx) => {
  try {
    validateRequestMethod(ctx.request.method, "GET");
    validateEnvVars(ctx);

    const accessToken = await getAccessToken(ctx.env);

    // TODO: load visa and mastercards only by default
    const products = await getProducts("visa", accessToken);

    if (products.length) {
      return Response.json(products, { status: 200 });
    }
    return Response.json({ message: "There are no products available." }, { status: 404 });
  } catch (error) {
    console.error("There was an error while processing your request.", error);
    return Response.json({ message: "There was an error while processing your request." }, { status: 500 });
  }
};

const getProducts = async (productQuery: string, accessToken: AccessToken) => {
  const url = `${getBaseUrl(accessToken.isSandbox)}/products?productName=${productQuery}`;
  console.log(`Retrieving products from ${url}`);
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

  return (responseJson as ReloadlyListGiftCardResponse).content;
};
