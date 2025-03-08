import { BigNumberish } from "ethers";
import { isAllowed } from "../../shared/allowed-country-list";
import { isGiftCardAvailable } from "../../shared/helpers";
import { GiftCard } from "../../shared/types";
import { commonHeaders, getGiftCards, getReloadlyApiBaseUrl } from "./shared";
import { getGiftCardById } from "../post-order";
import { fallbackIntlMastercardFirst, fallbackIntlMastercardSecond, fallbackIntlVisa, masterCardIntlSkus, visaIntlSkus } from "./reloadly-lists";
import { AccessToken, ReloadlyFailureResponse } from "./types";

export async function findBestCard(countryCode: string, amount: BigNumberish, accessToken: AccessToken): Promise<GiftCard | null> {
  if (!isAllowed(countryCode)) {
    console.error(`Country ${countryCode} is not in the allowed country list.`);
    return null;
  }

  if (accessToken.isSandbox) {
    // Load product differently on Reloadly sandbox
    // Sandbox doesn't have mastercard, it has only 1 visa card for US.
    // This visa card doesn't load with location based url, let's use special url
    // for this so that we have something to try on sandbox
    return await getSandboxGiftCard("visa", countryCode, accessToken);
  }
  const masterCards = await getGiftCards("mastercard", countryCode, accessToken);
  const bestMastercard = await findBestMastercard(masterCards, countryCode, amount, accessToken);
  if (bestMastercard) {
    return bestMastercard;
  }

  const visaCards = await getGiftCards("visa", countryCode, accessToken);
  const bestVisaCard = await findBestVisaCard(visaCards, countryCode, amount, accessToken);
  if (bestVisaCard) {
    return bestVisaCard;
  }

  const anyMastercard = masterCards?.find((masterCard) => isGiftCardAvailable(masterCard, amount));
  if (anyMastercard) {
    return anyMastercard;
  }

  const anyVisa = visaCards?.find((visaCard) => isGiftCardAvailable(visaCard, amount));
  if (anyVisa) {
    return anyVisa;
  }

  console.error(`No suitable card found for country code ${countryCode} and amount ${amount}.`);
  return null;
}

async function findBestMastercard(masterCards: GiftCard[], countryCode: string, amount: BigNumberish, accessToken: AccessToken): Promise<GiftCard | null> {
  const masterCardIntlSku = masterCardIntlSkus.find((sku) => sku.countryCode == countryCode);
  if (masterCardIntlSku) {
    const tokenizedIntlMastercard = masterCards?.find((masterCard) => masterCard.productId == masterCardIntlSku.sku);
    if (tokenizedIntlMastercard && isGiftCardAvailable(tokenizedIntlMastercard, amount)) {
      return tokenizedIntlMastercard;
    }
  }

  const fallbackMastercardFirst = await getFirstFallbackIntlMastercard(accessToken);
  if (fallbackMastercardFirst && isGiftCardAvailable(fallbackMastercardFirst, amount)) {
    return fallbackMastercardFirst;
  }

  const fallbackMastercardSecond = await getSecondFallbackIntlMastercard(accessToken);
  if (fallbackMastercardSecond && isGiftCardAvailable(fallbackMastercardSecond, amount)) {
    return fallbackMastercardSecond;
  }

  return null;
}

async function findBestVisaCard(visaCards: GiftCard[], countryCode: string, amount: BigNumberish, accessToken: AccessToken): Promise<GiftCard | null> {
  const visaIntlSku = visaIntlSkus.find((sku) => sku.countryCode == countryCode);
  if (visaIntlSku) {
    const intlVisa = visaCards?.find((visaCard) => visaCard.productId == visaIntlSku.sku);
    if (intlVisa && isGiftCardAvailable(intlVisa, amount)) {
      return intlVisa;
    }
  }

  const fallbackVisa = await getFallbackIntlVisa(accessToken);
  if (fallbackVisa && isGiftCardAvailable(fallbackVisa, amount)) {
    return fallbackVisa;
  }
  return null;
}
async function getFirstFallbackIntlMastercard(accessToken: AccessToken): Promise<GiftCard | null> {
  try {
    return await getGiftCardById(fallbackIntlMastercardFirst.sku, accessToken);
  } catch (e) {
    console.error(`Failed to load first fallback mastercard: ${JSON.stringify(fallbackIntlMastercardFirst)}`, e);
    return null;
  }
}

async function getSecondFallbackIntlMastercard(accessToken: AccessToken): Promise<GiftCard | null> {
  try {
    return await getGiftCardById(fallbackIntlMastercardSecond.sku, accessToken);
  } catch (e) {
    console.error(`Failed to load second fallback mastercard: ${JSON.stringify(fallbackIntlMastercardSecond)}`, e);
    return null;
  }
}

async function getFallbackIntlVisa(accessToken: AccessToken): Promise<GiftCard | null> {
  try {
    return await getGiftCardById(fallbackIntlVisa.sku, accessToken);
  } catch (e) {
    console.error(`Failed to load international US visa: ${JSON.stringify(fallbackIntlVisa)}\n${e}`);
    return null;
  }
}

async function getSandboxGiftCard(productQuery: string, country: string, accessToken: AccessToken): Promise<GiftCard> {
  if (!accessToken.isSandbox) {
    throw new Error("Cannot load sandbox card on production");
  }

  const url = `${getReloadlyApiBaseUrl(accessToken.isSandbox)}/products?productName=${productQuery}&productCategoryId=1`;

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

  if (response.status != 200) {
    throw new Error(
      `Error from Reloadly API: ${JSON.stringify({
        status: response.status,
        message: (responseJson as ReloadlyFailureResponse).message,
      })}`
    );
  }

  const paymentCards = (responseJson as { content: GiftCard[] })?.content;
  if (paymentCards.length) {
    return paymentCards[0];
  }
  throw new Error(`No suitable card found on sandbox for country code ${country}.`);
}
