import { BigNumberish } from "ethers";
import { GiftCard } from "../../../../shared/types";
import { getFixedPriceToValueMap, getGiftCardValue, isRangePriceGiftCardClaimable } from "../../../../shared/pricing";
import { formatEther } from "ethers/lib/utils";
import { getGiftCardActivateInfoHtml } from "./activate/activate-html";

const html = String.raw;

export function getGiftCardHtml(giftCard: GiftCard, rewardAmount: BigNumberish) {
  return html`
    <div class="card-section" id="offered-card" data-product-id="${giftCard.productId}">
      <div>
        <img src="${giftCard.logoUrls}" alt="${giftCard.productName}" />
      </div>
      <div class="details">
        <h3>${giftCard.productName}</h3>

        <div class="pricing ${giftCard.denominationType}">
          ${giftCard.denominationType == "FIXED" ? getFixedPricesHtml(giftCard, rewardAmount) : getRangePricesHtml(giftCard, rewardAmount)}
        </div>
        <div>SKU: ${giftCard.productId}</div>
        <button id="mint" class="btn" data-loading="false">
          <div class="action">Mint</div>
          <div class="icon"
            ><svg xmlns="http://www.w3.org/2000/svg" height="24" viewBox="0 -960 960 960" width="24" id="claim-icon">
              <path
                d="M252.309-180.001q-30.308 0-51.308-21t-21-51.308V-360H240v107.691q0 4.616 3.846 8.463 3.847 3.846 8.463 3.846h455.382q4.616 0 8.463-3.846 3.846-3.847 3.846-8.463V-360h59.999v107.691q0 30.308-21 51.308t-51.308 21H252.309ZM480-335.386 309.233-506.153l42.153-43.383 98.615 98.615v-336.001h59.998v336.001l98.615-98.615 42.153 43.383L480-335.386Z"
              ></path></svg
          ></div>
          <div class="loader">
            <svg
              version="1.1"
              id="L9"
              xmlns="http://www.w3.org/2000/svg"
              xmlns:xlink="http://www.w3.org/1999/xlink"
              width="33.33"
              height="33.33"
              viewBox="0 0 100 100"
              enable-background="new 0 0 0 0"
              xml:space="preserve"
            >
              <path fill="#fff" d="M73,50c0-12.7-10.3-23-23-23S27,37.3,27,50 M30.9,50c0-10.5,8.5-19.1,19.1-19.1S69.1,39.5,69.1,50"></path></svg
          ></div>
        </button>
      </div>
    </div>
    ${getGiftCardActivateInfoHtml(giftCard)}
  `;
}

function getFixedPricesHtml(giftCard: GiftCard, rewardAmount: BigNumberish) {
  const _html = html` <div>
    <div>Price</div>
    <div>Value</div>
  </div>`;

  const priceToValueMap = getFixedPriceToValueMap(giftCard);
  const priceAsKey = Number(formatEther(rewardAmount)).toFixed(2).toString();

  let matchingCardHtml = "";
  let otherCardsHtml = "";
  Object.keys(priceToValueMap).forEach((price) => {
    if (price == priceAsKey) {
      matchingCardHtml += html`<div class="available">
          <div title="${Number(price).toFixed(2)}${giftCard.senderCurrencyCode}">${Number(price).toFixed(0)}${giftCard.senderCurrencyCode}</div>
          <div title="${priceToValueMap[price].toFixed(2)}${giftCard.recipientCurrencyCode}"
            >${priceToValueMap[price].toFixed(0)}${giftCard.recipientCurrencyCode}</div
          > </div
        ><br /><p>Also available in</p>`;
    } else {
      otherCardsHtml += html`<div>
        <div title="${Number(price).toFixed(2)}${giftCard.senderCurrencyCode}">${Number(price).toFixed(0)}${giftCard.senderCurrencyCode}</div>
        <div title="${priceToValueMap[price].toFixed(2)}${giftCard.recipientCurrencyCode}"
          >${priceToValueMap[price].toFixed(0)}${giftCard.recipientCurrencyCode}</div
        >
      </div>`;
    }
  });
  return `${_html}${matchingCardHtml}${otherCardsHtml}`;
}

function getRangePricesHtml(giftCard: GiftCard, rewardAmount: BigNumberish) {
  let _html = ``;
  const giftCardValue = getGiftCardValue(giftCard, rewardAmount);
  const isAvailable = isRangePriceGiftCardClaimable(giftCard, rewardAmount);
  if (isAvailable) {
    _html += html`<div class="available">
      <div>
        <div class="amount">${giftCardValue.toFixed(2)} ${giftCard.recipientCurrencyCode}</div>
        <div class="currency">
          <div>Value inside</div>
        </div>
      </div>
    </div>`;
  }

  return _html;
}
