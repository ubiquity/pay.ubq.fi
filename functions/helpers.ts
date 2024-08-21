import { GiftCard } from "../shared/types";
import { mastercardInternationalSkus } from "./reloadly-lists";
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

export function pickBestCard(giftCards: GiftCard[], countryCode: string): GiftCard {
  const sku = mastercardInternationalSkus.find((sku) => sku.countryCode == countryCode);
  const giftCard = giftCards.find((giftCard) => giftCard.productId == sku.sku);
  if (giftCard) {
    return giftCard;
  }
}
