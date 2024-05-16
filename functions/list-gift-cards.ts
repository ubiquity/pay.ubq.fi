import { NotOkReloadlyApiResponse, ReloadlyListGiftCardResponse } from "../shared/types";
import { Env, getAccessToken, getBaseUrl, commonHeaders } from "./helpers";
import { AccessToken } from "./types";
import { validateEnvVars, validateRequestMethod } from "./validators";

export const onRequest: PagesFunction<Env> = async (ctx) => {
  try {
    validateRequestMethod(ctx.request.method, "GET");
    validateEnvVars(ctx);

    const accessToken = await getAccessToken(ctx.env);

    const visaCards = await getProducts("visa", accessToken);
    const masterCards = await getProducts("mastercard", accessToken);
    const products = [...masterCards, ...visaCards];

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
        message: (responseJson as NotOkReloadlyApiResponse).message,
      })}`
    );
  }

  return (responseJson as ReloadlyListGiftCardResponse).content;
};
