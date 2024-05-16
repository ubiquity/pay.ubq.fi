import { AccessToken, PriceToValueMap, ReloadlyProduct } from "./types";
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

  if (product.denominationType == "RANGE") {
    return isRangePriceProductAvailable(product, rewardAmount);
  } else if (product.denominationType == "FIXED") {
    return isFixedPriceProductAvailable(product, rewardAmount);
  }
}

// For use in range price only
// Because reward = price is fixed
// But we can select aa value within the range
export function getValueAfterFeeAndDiscount(product: ReloadlyProduct, rewardAmount: BigNumberish) {
  const rewardAmountWei = BigNumber.from(rewardAmount.toString());
  const productFeePercentageWei = parseEther(product.senderFeePercentage.toString());
  const senderFeeFixedWei = parseEther(product.senderFee.toString());
  const senderFeePercentageWei = rewardAmountWei.mul(productFeePercentageWei).div(100);
  const totalFeeWei = senderFeePercentageWei.add(senderFeeFixedWei);

  const discountPercentageWei = parseEther(product.discountPercentage.toString());
  const discountWei = rewardAmountWei.mul(discountPercentageWei).div(100);

  const value = rewardAmountWei.add(discountWei).sub(totalFeeWei);
  return Number(formatEther(value));
}

export function getEstimatedExchangeRate(product: ReloadlyProduct) {
  let exchangeRate = 1;
  if (product.recipientCurrencyCode != "USD") {
    if (product.denominationType == "FIXED") {
      const key = Object.keys(product.fixedRecipientToSenderDenominationsMap)[0];
      exchangeRate = product.fixedRecipientToSenderDenominationsMap[key] / Number(key);
    } else {
      exchangeRate = product.minSenderDenomination / product.minRecipientDenomination;
    }
  }
  return exchangeRate;
}
export function getRangePriceToValueMap(product: ReloadlyProduct) {
  // product.minRecipientDenomination, product.maxRecipientDenomination
  // are the range of values the gift card is availble in

  // product.minSenderDenomination, product.maxSenderDenomination
  // are the equivalent of available values range in our account currency USD
  // they do no include any fees, and we must add fees/discounts

  // price = amount that is deducted from our reloadly USD acacount when a gift card is claimed
  // value = amount the gift card holds, it can be any currency

  // price = value + percent discount of value - senderFee - percentFee of value
  // value = price - percent discount of value + senderFee + percentFee of value

  const priceToValueMap: PriceToValueMap = {};

  [product.minRecipientDenomination, product.maxRecipientDenomination].forEach((value) => {
    const totalPrice = getTotalPriceOfValue(Number(value), product);
    priceToValueMap[totalPrice.toFixed(2).toString()] = Number(value);
  });

  return priceToValueMap;
}

export function getTotalPriceOfValue(value: number, product: ReloadlyProduct) {
  const exchangeRate = getEstimatedExchangeRate(product);
  console.log(product.productId);
  console.log(exchangeRate, value);
  const usdValue = parseEther((exchangeRate * value).toString());

  // multiply by extra 100 to support minimum upto 0.01%
  // because we are using BigNumbers
  const feePercentage = BigNumber.from((product.senderFeePercentage * 100).toString());
  const fee = usdValue.mul(feePercentage).div(100 * 100);
  const totalFee = fee.add(parseEther(product.senderFee.toString()));
  const discountPercent = BigNumber.from(Math.trunc(product.discountPercentage * 100).toString());
  const discount = usdValue.mul(discountPercent).div(100 * 100);

  return Number(formatEther(usdValue.add(totalFee).sub(discount)));
}

export function getUsdValueForRangePrice(product: ReloadlyProduct, price: BigNumberish) {
  // price = value + senderFee + feePercent - discountPercent
  const priceWei = BigNumber.from(price.toString());
  const priceAfterFee = priceWei.sub(parseEther(product.senderFee.toString()));

  const feeDiscountPercentDiff = product.senderFeePercentage - product.discountPercentage;
  // multiply by extra 100 to support minimum upto 0.01%
  // because we are using BigNumbers
  const feeDiscountPercentDiffWei = parseEther(Math.trunc(feeDiscountPercentDiff * 100).toString());
  const hundredPercent = parseEther((100 * 100).toString());
  const priceWithAddedPercentFromFees = hundredPercent.add(feeDiscountPercentDiffWei);
  const usdValue = hundredPercent.mul(priceAfterFee).div(priceWithAddedPercentFromFees);
  return Number(formatEther(usdValue));
}

export function isRangePriceProductAvailable(product: ReloadlyProduct, rewardAmount: BigNumberish) {
  const value = Number(getProductValue(product, rewardAmount).toFixed(2));
  return value >= product.minRecipientDenomination && value <= product.maxRecipientDenomination;
}

export function getFixedPriceToValueMap(product: ReloadlyProduct) {
  const valueToPriceMap = product.fixedRecipientToSenderDenominationsMap;

  const priceToValueMap: PriceToValueMap = {};
  Object.keys(valueToPriceMap).forEach((value) => {
    const totalPrice = getTotalPriceOfValue(Number(value), product);
    priceToValueMap[totalPrice.toFixed(2).toString()] = Number(value);
  });

  return priceToValueMap;
}

export function isFixedPriceProductAvailable(product: ReloadlyProduct, rewardAmount: BigNumberish) {
  const priceToValueMap = getFixedPriceToValueMap(product);
  const priceAsKey = Number(formatEther(rewardAmount)).toFixed(2).toString();
  return !!priceToValueMap[priceAsKey];
}

export function getProductValue(product: ReloadlyProduct, reward: BigNumberish, exchangeRate?: number) {
  let productValue;
  const amountDaiEth = Number(formatEther(reward)).toFixed(2);
  if (product.denominationType == "FIXED") {
    const priceToValueMap = getFixedPriceToValueMap(product);
    productValue = priceToValueMap[amountDaiEth];
  } else if (product.denominationType == "RANGE") {
    const usdValue = getUsdValueForRangePrice(product, reward);
    if (!exchangeRate) {
      exchangeRate = getEstimatedExchangeRate(product);
    }
    productValue = usdValue / exchangeRate;
    console.log("usdValue", usdValue);
    console.log("productValue", productValue);
  } else {
    throw new Error(
      `Unknown denomination type of gift card: ${JSON.stringify({
        denominationType: product.denominationType,
      })}`
    );
  }

  if (!productValue) {
    throw new Error(`Product is not available for the reward amount: ${JSON.stringify({ product, reward: reward })}`);
  }
  return productValue;
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
