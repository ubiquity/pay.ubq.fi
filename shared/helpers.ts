import { AccessToken, ReloadlyProduct } from "./types";
import { BigNumber, BigNumberish, ethers } from "ethers";
import { formatEther, parseEther } from "ethers/lib/utils";

export interface Env {
  USE_RELOADLY_SANDBOX: boolean;
  RELOADLY_API_CLIENT_ID: string;
  RELOADLY_API_CLIENT_SECRET: string;
}

export type ReloadlyAuthResponse = {
  access_token: string;
  scope: string;
  expires_in: number;
  token_type: string;
};

export function initEnv() {
  // TODO: make sure env vars have values, and it is called everywhere needed
}

export async function getAccessToken(env: Env): Promise<AccessToken> {
  const url = "https://auth.reloadly.com/oauth/token";
  const options = {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      client_id: env.RELOADLY_API_CLIENT_ID,
      client_secret: env.RELOADLY_API_CLIENT_SECRET,
      grant_type: "client_credentials",
      audience: env.USE_RELOADLY_SANDBOX === false ? "https://giftcards.reloadly.com" : "https://giftcards-sandbox.reloadly.com",
    }),
  };

  const res = await fetch(url, options);
  if (res.status == 200) {
    const successResponse = (await res.json()) as ReloadlyAuthResponse;
    return {
      token: successResponse.access_token,
      isSandbox: env.USE_RELOADLY_SANDBOX !== false,
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

export function isProductAvailableForAmount(product: ReloadlyProduct, rewardAmount: BigNumberish) {
  if (product.senderCurrencyCode != "USD") {
    throw new Error(`Failed to validate price because product's senderCurrencyCode is not USD: ${JSON.stringify({ rewardAmount, product })}`);
  }

  const value = getProductValueAfterFee(product, rewardAmount);

  return (
    (product.denominationType == "FIXED" && product.fixedSenderDenominations.includes(value)) ||
    (product.denominationType == "RANGE" && value >= product.minSenderDenomination && value <= product.maxSenderDenomination)
  );
}

export function getProductValueAfterFee(product: ReloadlyProduct, rewardAmount: BigNumberish) {
  const rewardAmountEth = BigNumber.from(rewardAmount.toString());
  const productFeePercentageEth = parseEther(product.senderFeePercentage.toString());
  const senderFeeFixed = parseEther(product.senderFee.toString());
  const senderFeePercentage = rewardAmountEth.mul(productFeePercentageEth).div(100);
  const totalFee = senderFeePercentage.add(senderFeeFixed);
  const remainingValue = rewardAmountEth.sub(totalFee);
  return Number(formatEther(remainingValue));
}

export function addProductFeesToPrice(product: ReloadlyProduct, price: number) {
  const priceEth = parseEther(price.toString());
  const productFeePercentageEth = parseEther(product.senderFeePercentage.toString());

  const senderFeeFixed = parseEther(product.senderFee.toString());
  const senderFeePercentage = priceEth.mul(productFeePercentageEth).div(100);
  const totalFee = senderFeePercentage.add(senderFeeFixed);

  const priceWithFees = priceEth.add(totalFee);
  return Number(formatEther(priceWithFees));
}

export function getGiftCardOrderId(rewardToAddress: string, signature: string) {
  const checksumAddress = ethers.utils.getAddress(rewardToAddress);
  const integrityString = checksumAddress + ":" + signature;
  const integrityBytes = ethers.utils.toUtf8Bytes(integrityString);
  return ethers.utils.keccak256(integrityBytes);
}

export function getMessageToSign(transactionId: number) {
  return JSON.stringify({
    from: "pay.ubq.fi",
    transactionId: transactionId,
  });
}
