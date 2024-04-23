import { BigNumberish } from "ethers";
import { ReloadlyProduct } from "../../../../shared/types";
import { getProductValueAfterFee, isProductAvailableForAmount } from "../../../../shared/helpers";
import { getFixedPricesAndValues } from "./helpers";
import { formatEther } from "ethers/lib/utils";

const html = String.raw;

export function getGiftCardHtml(giftcard: ReloadlyProduct, allowBuy: boolean, rewardAmount: BigNumberish) {
  return html`
    <div class="product" data-product-id="${giftcard.productId}">
      <div>
        <h3 title="${giftcard.productName}">${giftcard.productName.length > 16 ? giftcard.productName.substring(0, 16) + "..." : giftcard.productName}</h3>
        <p>
          <img src="${giftcard.logoUrls}" alt="${giftcard.productName}" />
        </p>

        <div class="buttons">
          <button class="activate-btn">
            <span class="action">Activate</span>
          </button>
          ${allowBuy
            ? `<button class="claim-gift-card-btn" data-loading="false">
          <span class="action">Claim</span>
          <span class="loading">
            <svg
              version="1.1"
              id="L9"
              xmlns="http://www.w3.org/2000/svg"
              xmlns:xlink="http://www.w3.org/1999/xlink"
              width="13"
              height="13"
              viewBox="0 0 100 100"
              enable-background="new 0 0 0 0"
              xml:space="preserve"
            >
              <path fill="#fff" d="M73,50c0-12.7-10.3-23-23-23S27,37.3,27,50 M30.9,50c0-10.5,8.5-19.1,19.1-19.1S69.1,39.5,69.1,50"></path>
            </svg>
          </span>
        </button>`
            : ``}
        </div>

        <div class="pricing ${giftcard.denominationType}">
          ${isProductAvailableForAmount(giftcard, rewardAmount)
            ? `
            <div>
            <div>Price</div>
            <div>Value</div>
          </div>
          <div>
            <div>${Number(formatEther(rewardAmount)).toFixed(1)}${giftcard.senderCurrencyCode}</div>
            <div>${getProductValueAfterFee(giftcard, rewardAmount).toFixed(1)}${giftcard.senderCurrencyCode}</div>
          </div>
          `
            : `${
                giftcard.denominationType == "FIXED"
                  ? `<div>
                      <div>Price</div>
                      <div>Value</div>
                    </div>
                    ${getFixedPricesAndValues(giftcard)}`
                  : `<div>
                  <div>Price</div>
                  <div>${giftcard.minSenderDenomination}-${giftcard.maxSenderDenomination}${giftcard.senderCurrencyCode}</div>
                </div>
                <div>
                  <div>Value</div>
                  <div>${giftcard.minRecipientDenomination}-${giftcard.maxRecipientDenomination}${giftcard.recipientCurrencyCode}</div>
                </div>
                <div>
                  <div>Fee</div>
                  <div>(${giftcard.senderFee}${giftcard.senderCurrencyCode}+${giftcard.senderFeePercentage}%fee)</div>
                </div>
                `
              }`}
        </div>
      </div>
    </div>
  `;
}
