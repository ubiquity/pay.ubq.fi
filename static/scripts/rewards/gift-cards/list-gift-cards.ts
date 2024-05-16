import { getGiftCardOrderId } from "../../../../shared/helpers";
import { ReloadlyProduct, ReloadlyTransaction } from "../../../../shared/types";
import { AppState } from "../app-state";
import { attachActivateInfoAction } from "./activate/activate-action";
import { attachClaimAction } from "./claim/claim-action";
import { attachRevealAction } from "./reveal/reveal-action";
import { getApiBaseUrl } from "./helpers";
import { getGiftCardActivateInfoHtml } from "./activate/activate-html";
import { getGiftCardHtml } from "./gift-card";
import { getRedeemCodeHtml } from "./reveal/redeem-code-html";

const html = String.raw;

export async function initCollectGiftCard(app: AppState) {
  const retrieveOrderUrl = `${getApiBaseUrl()}/get-order?orderId=${getGiftCardOrderId(app.reward.beneficiary, app.reward.signature)}`;
  const listGiftCardsUrl = `${getApiBaseUrl()}/list-gift-cards`;

  const requestInit = {
    method: "GET",
    headers: {
      Accept: "application/json",
    },
  };

  const [retrieveOrderResponse, retrieveGiftCardsResponse] = await Promise.all([fetch(retrieveOrderUrl, requestInit), fetch(listGiftCardsUrl, requestInit)]);

  const transaction = (await retrieveOrderResponse.json()) as ReloadlyTransaction;
  const giftcards = (await retrieveGiftCardsResponse.json()) as ReloadlyProduct[];

  const giftCardsSection = document.getElementById("gift-cards");
  if (!giftCardsSection) {
    console.error("Missing gift cards section #gift-cards");
    return;
  }
  const activateInfoSection = document.getElementById("activate-info");
  if (!activateInfoSection) {
    console.error("Missing gift cards activate info section #activate-info");
    return;
  }

  if (retrieveOrderResponse.status == 200) {
    const giftcard = giftcards.find((giftcard) => transaction.product.productId == giftcard.productId);

    let giftCardsHtml = `<h2 class="heading-gift-card">Your gift card</h2>`;
    giftCardsHtml += `<div class="products purchased">`;
    if (giftcard) {
      giftCardsHtml += getGiftCardHtml(giftcard, false, app.reward.amount);
    }
    giftCardsHtml += getRedeemCodeHtml(transaction);
    giftCardsHtml += `</div>`;
    giftCardsSection.innerHTML = giftCardsHtml;

    let activateInfoHtml = "";
    if (giftcard) {
      activateInfoHtml += getGiftCardActivateInfoHtml(giftcard);
    }

    activateInfoSection.innerHTML = activateInfoHtml;

    attachRevealAction(transaction, app);
  } else if (retrieveGiftCardsResponse.status == 200) {
    let giftCardsHtml = `<h2 class="heading-gift-card">Or claim in virtual visa/mastercard</h2>`;
    giftCardsHtml += `<div class="products">`;
    giftcards.forEach((giftcard: ReloadlyProduct) => {
      giftCardsHtml += getGiftCardHtml(giftcard, true, app.reward.amount);
    });
    giftCardsHtml += `</div><br />`;
    giftCardsHtml += getDisclaimerHtml();
    giftCardsHtml += `<p></p>`;
    giftCardsHtml += `<p></p>`;

    giftCardsSection.innerHTML = giftCardsHtml;

    let activateInfoHtml = "";
    giftcards.forEach((giftcard: ReloadlyProduct) => {
      activateInfoHtml += getGiftCardActivateInfoHtml(giftcard);
    });
    activateInfoSection.innerHTML = activateInfoHtml;

    attachClaimAction("claim-gift-card-btn", giftcards, app);
  } else {
    giftCardsSection.innerText = "There was a problem in fetching gift cards. Try again later.";
  }

  attachActivateInfoAction();
}

function getDisclaimerHtml() {
  return html`
    <h2>Disclaimer</h2>
    <p>All visa/mastercards are non-exchangeable & non-refundable.</p>
    <p>Exact value of a card can be slightly different due to exchange rate.</p>
  `;
}
