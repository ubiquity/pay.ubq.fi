import { allowedCountries } from "../../../../shared/allowed-country-list";
import { getGiftCardOrderId, isGiftCardAvailable } from "../../../../shared/helpers";
import { GiftCard, OrderTransaction } from "../../../../shared/types";
import { AppState } from "../app-state";
import { getGiftCardHtml } from "./gift-card";
import { getApiBaseUrl, getUserCountryCode } from "./helpers";
import { attachMintAction } from "./mint/mint-action";
import { getRedeemCodeHtml } from "./reveal/redeem-code-html";
import { attachRevealAction } from "./reveal/reveal-action";

export async function initClaimGiftCard(app: AppState) {
  const giftCardsSection = document.getElementById("gift-cards");
  if (!giftCardsSection) {
    console.error("Missing gift cards section #gift-cards");
    return;
  }
  giftCardsSection.innerHTML = "Loading...";

  const country = await getUserCountryCode();
  if (!country) {
    giftCardsSection.innerHTML = `<p class="card-error">Failed to load suitable virtual cards for you. Refresh or try disabling adblocker.</p>`;
    return;
  }

  if (!allowedCountries.find((allowedCountry) => allowedCountry.code == country)) {
    giftCardsSection.innerHTML = `<p class="card-error">Virtual cards are not available for your location. Use other methods to claim your reward.</p>`;
    return;
  }

  const retrieveOrderUrl = `${getApiBaseUrl()}/get-order?orderId=${getGiftCardOrderId(app.reward.beneficiary, app.reward.signature)}`;
  const bestCardUrl = `${getApiBaseUrl()}/get-best-card?country=${country}&amount=${app.reward.amount}`;

  const requestInit = {
    method: "GET",
    headers: {
      Accept: "application/json",
    },
  };

  const [orderResponse, bestCardResponse] = await Promise.all([fetch(retrieveOrderUrl, requestInit), fetch(bestCardUrl, requestInit)]);

  const giftCard = (await bestCardResponse.json()) as GiftCard;

  if (orderResponse.status == 200) {
    const { transaction, product } = (await orderResponse.json()) as {
      transaction: OrderTransaction;
      product: GiftCard | null;
    };

    addPurchasedCardHtml(product, transaction, app, giftCardsSection);
  } else if (bestCardResponse.status == 200) {
    const availableGiftCard = isGiftCardAvailable(giftCard, app.reward.amount) ? giftCard : null;

    addAvailableCardsHtml(availableGiftCard, app, giftCardsSection);
  } else if (bestCardResponse.status == 404) {
    giftCardsSection.innerHTML = "<p class='card-error'>There are no Visa/Mastercard available to claim at the moment.</p>";
  } else {
    giftCardsSection.innerHTML = "<p class='card-error'>There was a problem in fetching gift cards. Try again later.</p>";
  }
}

function addPurchasedCardHtml(giftCard: GiftCard | null, transaction: OrderTransaction, app: AppState, giftCardsSection: HTMLElement) {
  const htmlParts: string[] = [];
  htmlParts.push(`<h2 class="card-heading">Your virtual visa/mastercard</h2>`);
  htmlParts.push(getRedeemCodeHtml(transaction));
  if (giftCard) {
    htmlParts.push(getGiftCardHtml(giftCard, app.reward.amount));
  }
  giftCardsSection.innerHTML = htmlParts.join("");
  attachRevealAction(transaction, app);
}

function addAvailableCardsHtml(giftCard: GiftCard | null, app: AppState, giftCardsSection: HTMLElement) {
  const htmlParts: string[] = [];

  htmlParts.push(`<h2 class="card-heading">Or mint a virtual visa/mastercard</h2>`);
  if (giftCard) {
    htmlParts.push(getGiftCardHtml(giftCard, app.reward.amount));
    giftCardsSection.innerHTML = htmlParts.join("");
    attachMintAction(giftCard, app);
  } else {
    htmlParts.push(`<p class="card-error">There are no Visa/Mastercard available to claim at the moment.</p>`);
    giftCardsSection.innerHTML = htmlParts.join("");
  }
}
