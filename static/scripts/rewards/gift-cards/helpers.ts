import { addProductFeesToValue } from "../../../../shared/helpers";
import { ReloadlyProduct } from "../../../../shared/types";

export function getApiBaseUrl() {
  return "";
}

export function getFixedPricesAndValues(giftcard: ReloadlyProduct) {
  let html = "";
  giftcard.fixedSenderDenominations.forEach((priceWithoutFee, i) => {
    const price = addProductFeesToValue(giftcard, priceWithoutFee);
    html += `<div><div>${price.toFixed(1)}${giftcard.senderCurrencyCode}</div><div>${giftcard.fixedRecipientDenominations[i].toFixed(1)}${giftcard.recipientCurrencyCode}</div></div>`;
  });
  return html;
}
