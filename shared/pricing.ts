import { BigNumber, BigNumberish } from "ethers";
import { formatEther, parseEther } from "@ethersproject/units";
import { PriceToValueMap, GiftCard } from "./types";

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
 * For fixed price gift cards, the value is provided by following fields.
 * Elements of GiftCard.fixedRecipientDenominations[]
 * Keys of GiftCard.fixedRecipientToSenderDenominationsMap {}[]
 * value = price - percent discount of value + senderFee + percentFee of value
 *
 * For ranged price gift cards, the value is any amount between the following fields.
 * GiftCard.minRecipientDenomination
 * GiftCard.maxRecipientDenomination
 *
 * Following fields are the equivalent of available values range in our account currency (USD).
 * GiftCard.minSenderDenomination
 * GiftCard.maxSenderDenomination
 * Values of GiftCard.fixedRecipientToSenderDenominationsMap{}[]
 */

export function isClaimableForAmount(giftCard: GiftCard, rewardAmount: BigNumberish) {
  if (giftCard.senderCurrencyCode != "USD") {
    throw new Error(`Failed to validate price because gift card's senderCurrencyCode is not USD: ${JSON.stringify({ rewardAmount, giftCard: giftCard })}`);
  }

  if (giftCard.denominationType == "RANGE") {
    return isRangePriceGiftCardClaimable(giftCard, rewardAmount);
  } else if (giftCard.denominationType == "FIXED") {
    return isFixedPriceGiftCardClaimable(giftCard, rewardAmount);
  }
}

export function getEstimatedExchangeRate(giftCard: GiftCard) {
  let exchangeRate = 1;
  if (giftCard.recipientCurrencyCode != "USD") {
    if (giftCard.denominationType == "FIXED") {
      const key = Object.keys(giftCard.fixedRecipientToSenderDenominationsMap)[0];
      exchangeRate = giftCard.fixedRecipientToSenderDenominationsMap[key] / Number(key);
    } else {
      exchangeRate = giftCard.minSenderDenomination / giftCard.minRecipientDenomination;
    }
  }
  return exchangeRate;
}

export function getTotalPriceOfValue(value: number, giftCard: GiftCard) {
  const exchangeRate = getEstimatedExchangeRate(giftCard);
  const usdValue = parseEther((exchangeRate * value).toString());

  // multiply by extra 100 to support minimum upto 0.01%
  // because we are using BigNumbers
  const feePercentage = BigNumber.from((giftCard.senderFeePercentage * 100).toString());
  const fee = usdValue.mul(feePercentage).div(100 * 100);
  const totalFee = fee.add(parseEther(giftCard.senderFee.toString()));
  const discountPercent = BigNumber.from(Math.trunc(giftCard.discountPercentage * 100).toString());
  const discount = usdValue.mul(discountPercent).div(100 * 100);

  return Number(formatEther(usdValue.add(totalFee).sub(discount)));
}

export function getRangePriceToValueMap(giftCard: GiftCard) {
  const priceToValueMap: PriceToValueMap = {};

  [giftCard.minRecipientDenomination, giftCard.maxRecipientDenomination].forEach((value) => {
    const totalPrice = getTotalPriceOfValue(Number(value), giftCard);
    priceToValueMap[totalPrice.toFixed(2).toString()] = Number(value);
  });

  return priceToValueMap;
}

export function getUsdValueForRangePrice(giftCard: GiftCard, price: BigNumberish) {
  // price = value + senderFee + feePercent - discountPercent
  const priceWei = BigNumber.from(price.toString());
  const priceAfterFee = priceWei.sub(parseEther(giftCard.senderFee.toString()));

  const feeDiscountPercentDiff = giftCard.senderFeePercentage - giftCard.discountPercentage;
  // multiply by extra 100 to support minimum upto 0.01%
  // because we are using BigNumbers
  const feeDiscountPercentDiffWei = parseEther(Math.trunc(feeDiscountPercentDiff * 100).toString());
  const hundredPercent = parseEther((100 * 100).toString());
  const priceWithAddedPercentFromFees = hundredPercent.add(feeDiscountPercentDiffWei);
  const usdValue = hundredPercent.mul(priceAfterFee).div(priceWithAddedPercentFromFees);
  return Number(formatEther(usdValue));
}

export function isRangePriceGiftCardClaimable(giftCard: GiftCard, rewardAmount: BigNumberish) {
  const value = Number(getGiftCardValue(giftCard, rewardAmount).toFixed(2));
  return value >= giftCard.minRecipientDenomination && value <= giftCard.maxRecipientDenomination;
}

export function getFixedPriceToValueMap(giftCard: GiftCard) {
  const valueToPriceMap = giftCard.fixedRecipientToSenderDenominationsMap;

  const priceToValueMap: PriceToValueMap = {};
  Object.keys(valueToPriceMap).forEach((value) => {
    const totalPrice = getTotalPriceOfValue(Number(value), giftCard);
    priceToValueMap[totalPrice.toFixed(2).toString()] = Number(value);
  });

  return priceToValueMap;
}

export function isFixedPriceGiftCardClaimable(giftCard: GiftCard, rewardAmount: BigNumberish) {
  const priceToValueMap = getFixedPriceToValueMap(giftCard);
  const priceAsKey = Number(formatEther(rewardAmount)).toFixed(2).toString();
  return !!priceToValueMap[priceAsKey];
}

export function getGiftCardValue(giftCard: GiftCard, reward: BigNumberish, exchangeRate?: number) {
  let giftCardValue;
  const amountDaiEth = Number(formatEther(reward)).toFixed(2);
  if (giftCard.denominationType == "FIXED") {
    const priceToValueMap = getFixedPriceToValueMap(giftCard);
    giftCardValue = priceToValueMap[amountDaiEth];
  } else if (giftCard.denominationType == "RANGE") {
    const usdValue = getUsdValueForRangePrice(giftCard, reward);
    if (!exchangeRate) {
      exchangeRate = getEstimatedExchangeRate(giftCard);
    }
    giftCardValue = usdValue / exchangeRate;
  } else {
    throw new Error(
      `Unknown denomination type of gift card: ${JSON.stringify({
        denominationType: giftCard.denominationType,
      })}`
    );
  }
  return giftCardValue;
}
