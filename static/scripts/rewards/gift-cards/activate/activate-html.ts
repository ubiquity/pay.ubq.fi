import { GiftCard } from "../../../../../shared/types";

const html = String.raw;

export function getGiftCardActivateInfoHtml(giftCard: GiftCard) {
  return html`
    <div class="redeem-info">
      <fieldset>
        <legend>How to use redeem code?</legend>
        <div class="instructions">
          <p
            >${giftCard.redeemInstruction.concise.replace("\n", "<br>")}
            ${giftCard.redeemInstruction.concise != giftCard.redeemInstruction.verbose
              ? `<a href="javascript:;" onclick="document.getElementById('verbose').classList.remove('hidden');this.remove();">...Read more</a>`
              : ``}</p
          >

          <p id="verbose" class="hidden">${giftCard.redeemInstruction.verbose.replace("\n", "<br>")}</p>
        </div>
      </fieldset>
    </div>
  `;
}
