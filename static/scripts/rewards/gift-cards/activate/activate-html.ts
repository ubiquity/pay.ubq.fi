import { GiftCard } from "../../../../../shared/types";

const html = String.raw;

export function getGiftCardActivateInfoHtml(giftCard: GiftCard) {
  return html`
    <div class="redeem-info-wrapper">
      <div class="redeem-info">
        <fieldset>
          <legend>How to use redeem code?</legend>
          <div class="instructions">
            <p>${giftCard.redeemInstruction.concise}</p>
            ${giftCard.redeemInstruction.concise != giftCard.redeemInstruction.verbose ? `<p>${giftCard.redeemInstruction.verbose}</p>` : ``}
          </div>
        </fieldset>
      </div>
    </div>
  `;
}
