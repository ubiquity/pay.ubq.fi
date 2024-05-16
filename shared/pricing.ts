import { BigNumber, BigNumberish } from "ethers";
import { formatEther, parseEther } from "ethers/lib/utils";
import { PriceToValueMap, ReloadlyProduct } from "./types";

/**
 * PRICE OF A GIFT CARD
 * ====================
 * Price of a gift card is the amount that a user must pay to get the gift card.
 * It includes fees and discounts. It is always in USD. No field in the Reloadly API
 * provides exact price of gift card. It must be calculated manually from value of card, fees, and discount.
 * price = value + percent discount of value - senderFee - percentFee of value
 *
 * VALUE OF A GIFT CARD
 * ====================
 * Value of a gift is the amount that is available within the gift card.
 * It can be in any currency.
 *
 * For fixed price products, the value is provided by following fields.
 * Elements of ReloadlyProduct.fixedRecipientDenominations[]
 * Keys of ReloadlyProduct.fixedRecipientToSenderDenominationsMap {}[]
 * value = price - percent discount of value + senderFee + percentFee of value
 *
 * For ranged price products, the value is any amount between the following fields.
 * ReloadlyProduct.minRecipientDenomination
 * ReloadlyProduct.maxRecipientDenomination
 *
 * Following fields are the equivalent of available values range in our account currency (USD).
 * ReloadlyProduct.minSenderDenomination
 * ReloadlyProduct.maxSenderDenomination
 * Values of ReloadlyProduct.fixedRecipientToSenderDenominationsMap{}[]
 */

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

export function getRangePriceToValueMap(product: ReloadlyProduct) {
  const priceToValueMap: PriceToValueMap = {};

  [product.minRecipientDenomination, product.maxRecipientDenomination].forEach((value) => {
    const totalPrice = getTotalPriceOfValue(Number(value), product);
    priceToValueMap[totalPrice.toFixed(2).toString()] = Number(value);
  });

  return priceToValueMap;
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
