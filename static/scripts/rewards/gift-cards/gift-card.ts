import { BigNumberish } from "ethers";
import { ReloadlyProduct } from "../../../../shared/types";
import { getFixedPriceToValueMap, getProductValue, getRangePriceToValueMap, isRangePriceProductAvailable } from "../../../../shared/pricing";
import { formatEther } from "ethers/lib/utils";

const html = String.raw;

export function getGiftCardHtml(giftCard: ReloadlyProduct, allowBuy: boolean, rewardAmount: BigNumberish) {
  return html`
    <div class="product" data-product-id="${giftCard.productId}">
      <div>
        <h3 title="${giftCard.productName}">${giftCard.productName.length > 16 ? giftCard.productName.substring(0, 16) + "..." : giftCard.productName}</h3>
        <p>
          <img src="${giftCard.logoUrls}" alt="${giftCard.productName}" />
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

        <div class="pricing ${giftCard.denominationType}">
          ${giftCard.denominationType == "FIXED" ? getFixedPricesHtml(giftCard, rewardAmount) : getRangePricesHtml(giftCard, rewardAmount)}
        </div>
      </div>
    </div>
  `;
}

function getFixedPricesHtml(giftCard: ReloadlyProduct, rewardAmount: BigNumberish) {
  let _html = html` <div>
    <div>Price</div>
    <div>Value</div>
  </div>`;

  const priceToValueMap = getFixedPriceToValueMap(giftCard);
  const priceAsKey = Number(formatEther(rewardAmount)).toFixed(2).toString();

  Object.keys(priceToValueMap).forEach((price) => {
    const _class = price == priceAsKey ? ` class="available"` : ``;
    _html += html`<div${_class}>
      <div>${Number(price).toFixed(0)}${giftCard.senderCurrencyCode}</div>
      <div>${priceToValueMap[price].toFixed(0)}${giftCard.recipientCurrencyCode}</div>
    </div>`;
  });
  return _html;
}

function getRangePricesHtml(giftCard: ReloadlyProduct, rewardAmount: BigNumberish) {
  let _html = ``;
  const productValue = getProductValue(giftCard, rewardAmount);
  const isAvailable = isRangePriceProductAvailable(giftCard, rewardAmount);
  if (isAvailable) {
    _html += html` <div>
        <div>Price</div>
        <div>Value</div>
      </div>
      <div class="available">
        <div>${formatEther(rewardAmount)}${giftCard.senderCurrencyCode}</div>
        <div>${productValue.toFixed(2)}${giftCard.recipientCurrencyCode}</div> </div
      ><br /><p>Available in range</p>`;
  }

  const priceToValueMap = getRangePriceToValueMap(giftCard);
  const prices = Object.keys(priceToValueMap);

  _html += html`
    <div>
      <div>Value</div>
      <div>${giftCard.minRecipientDenomination.toFixed(0)}-${giftCard.maxRecipientDenomination.toFixed(0)}${giftCard.recipientCurrencyCode}</div>
    </div>
    <div>
      <div>Price</div>
      <div>${Number(prices[0]).toFixed(0)}-${Number(prices[1]).toFixed(0)}${giftCard.senderCurrencyCode}</div>
    </div>
  `;

  return _html;
}
