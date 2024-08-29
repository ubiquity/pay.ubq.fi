import { GiftCard } from "../shared/types";
import { allowedCountries } from "../shared/allowed-country-list";
import { getGiftCardById } from "./post-order";
import { fallbackIntlMastercard, fallbackIntlVisa, masterCardIntlSkus, visaIntlSkus } from "./reloadly-lists";
import { AccessToken, ReloadlyFailureResponse } from "./types";

export const allowedChainIds = [1, 5, 100, 31337];

export const commonHeaders = {
  "Content-Type": "application/json",
  Accept: "application/com.reloadly.giftcards-v1+json",
};

export interface Env {
  USE_RELOADLY_SANDBOX: string;
  RELOADLY_API_CLIENT_ID: string;
  RELOADLY_API_CLIENT_SECRET: string;
}

export interface ReloadlyAuthResponse {
  access_token: string;
  scope: string;
  expires_in: number;
  token_type: string;
}

export async function getAccessToken(env: Env): Promise<AccessToken> {
  console.log("Using Reloadly Sandbox:", env.USE_RELOADLY_SANDBOX !== "false");

  const url = "https://auth.reloadly.com/oauth/token";
  const options = {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      client_id: env.RELOADLY_API_CLIENT_ID,
      client_secret: env.RELOADLY_API_CLIENT_SECRET,
      grant_type: "client_credentials",
      audience: env.USE_RELOADLY_SANDBOX === "false" ? "https://giftcards.reloadly.com" : "https://giftcards-sandbox.reloadly.com",
    }),
  };

  const res = await fetch(url, options);
  if (res.status == 200) {
    const successResponse = (await res.json()) as ReloadlyAuthResponse;
    return {
      token: successResponse.access_token,
      isSandbox: env.USE_RELOADLY_SANDBOX !== "false",
    };
  }
  throw `Getting access token failed: ${JSON.stringify(await res.json())}`;
}

export function getBaseUrl(isSandbox: boolean): string {
  if (isSandbox === false) {
    return "https://giftcards.reloadly.com";
  }
  return "https://giftcards-sandbox.reloadly.com";
}

export async function findBestCard(countryCode: string, accessToken: AccessToken): Promise<GiftCard> {
  const supportedCountry = allowedCountries.find((listItem) => listItem.code == countryCode);
  if (!supportedCountry) {
    throw new Error(`Country ${countryCode} is not in the allowed country list.`);
  }

  const [masterCards, visaCards] = await Promise.all([getGiftCards("mastercard", countryCode, accessToken), getGiftCards("visa", countryCode, accessToken)]);
  const giftCards = [...masterCards, ...visaCards];

  const masterCardIntlSku = masterCardIntlSkus.find((sku) => sku.countryCode == countryCode);
  if (masterCardIntlSku) {
    const tokenizedIntlMastercard = giftCards.find((giftCard) => giftCard.productId == masterCardIntlSku.sku);
    if (tokenizedIntlMastercard) {
      return tokenizedIntlMastercard;
    }
  }

  const fallbackMastercard = await getFallbackIntlMastercard(accessToken);
  if (fallbackMastercard) {
    return fallbackMastercard;
  }

  const visaIntlSku = visaIntlSkus.find((sku) => sku.countryCode == countryCode);
  if (visaIntlSku) {
    const intlVisa = giftCards.find((giftCard) => giftCard.productId == visaIntlSku.sku);
    if (intlVisa) {
      return intlVisa;
    }
  }

  const fallbackVisa = await getFallbackIntlVisa(accessToken);
  if (fallbackVisa) {
    return fallbackVisa;
  }

  if (giftCards.length) {
    const localMastercard = giftCards.find((giftCard) => giftCard.productName.toLocaleLowerCase().includes("mastercard"));
    if (localMastercard) {
      return localMastercard;
    }

    const localVisa = giftCards.find((giftCard) => giftCard.productName.toLocaleLowerCase().includes("visa"));
    if (localVisa) {
      return localVisa;
    }
  }

  throw new Error(`No suitable card found for country code ${countryCode}`);
}

async function getFallbackIntlMastercard(accessToken: AccessToken): Promise<GiftCard | null> {
  try {
    return await getGiftCardById(fallbackIntlMastercard.sku, accessToken);
  } catch (e) {
    console.log(`Failed to load international US mastercard: ${JSON.stringify(fallbackIntlMastercard)}\n${JSON.stringify(JSON.stringify)}`);
    return null;
  }
}

async function getFallbackIntlVisa(accessToken: AccessToken): Promise<GiftCard | null> {
  try {
    return await getGiftCardById(fallbackIntlVisa.sku, accessToken);
  } catch (e) {
    console.log(`Failed to load international US visa: ${JSON.stringify(fallbackIntlVisa)}\n${JSON.stringify(JSON.stringify)}`);
    return null;
  }
}

export async function getGiftCards(productQuery: string, country: string, accessToken: AccessToken): Promise<GiftCard[]> {
  if (accessToken.isSandbox) {
    // Load product differently on Reloadly sandbox
    // Sandbox doesn't have mastercard, it has only 1 visa card for US.
    // This visa card doesn't load with location based url, let's use special url
    // for this so that we have something to try on sandbox
    return await getSandboxGiftCards(productQuery, country, accessToken);
  }
  // productCategoryId = 1 = Finance.
  // This should prevent mixing of other gift cards with similar keywords
  const url = `${getBaseUrl(accessToken.isSandbox)}/countries/${country}/products?productName=${productQuery}&productCategoryId=1`;

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

async function getSandboxGiftCards(productQuery: string, country: string, accessToken: AccessToken): Promise<GiftCard[]> {
  const url = `${getBaseUrl(accessToken.isSandbox)}/products?productName=${productQuery}&productCategoryId=1`;

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

  return (responseJson as { content: GiftCard[] })?.content;
}
