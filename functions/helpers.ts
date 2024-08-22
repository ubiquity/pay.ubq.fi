import { GiftCard } from "../shared/types";
import { getGiftCardById } from "./post-order";
import { countryAllowList, fallbackInternationalMastercard, fallbackInternationalVisa, mastercardInternationalSkus, visaIntlSkus } from "./reloadly-lists";
import { AccessToken } from "./types";

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

export async function pickBestCard(giftCards: GiftCard[], countryCode: string, accessToken: AccessToken): Promise<GiftCard> {
  const supportedCountry = countryAllowList.find((listItem) => listItem.code == countryCode);
  if (!supportedCountry) {
    throw new Error(`Country ${countryCode} is not in the allowed country list.`);
  }

  const masterCardIntlSku = mastercardInternationalSkus.find((sku) => sku.countryCode == countryCode);
  if (masterCardIntlSku) {
    const tokenizedIntlMastercard = giftCards.find((giftCard) => giftCard.productId == masterCardIntlSku.sku);
    if (tokenizedIntlMastercard) {
      return tokenizedIntlMastercard;
    }
  }

  const fallbackMastercard = await getFallbackIntlMasteracrd(accessToken);
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

async function getFallbackIntlMasteracrd(accessToken: AccessToken): Promise<GiftCard | null> {
  try {
    return await getGiftCardById(fallbackInternationalMastercard.sku, accessToken);
  } catch (e) {
    console.log(`Failed to load international US mastercard: ${JSON.stringify(fallbackInternationalMastercard)}\n${JSON.stringify(JSON.stringify)}`);
    return null;
  }
}

async function getFallbackIntlVisa(accessToken: AccessToken): Promise<GiftCard | null> {
  try {
    return await getGiftCardById(fallbackInternationalVisa.sku, accessToken);
  } catch (e) {
    console.log(`Failed to load international US visa: ${JSON.stringify(fallbackInternationalVisa)}\n${JSON.stringify(JSON.stringify)}`);
    return null;
  }
}
