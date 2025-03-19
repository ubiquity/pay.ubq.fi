import { app } from "../app-state";
import { initClaimGiftCard } from "../gift-cards/index";
import { buttonController, getMakeClaimButton } from "../button-controller";
import { table, updateButtonVisibility } from "./fetch-permits";
import { renderTransaction } from "./render-transaction";
import { removeAllEventListeners } from "./utils";

const nextTxButton = document.getElementById("nextTx");
const prevTxButton = document.getElementById("prevTx");

export function claimRewardsPagination(rewardsCount: HTMLElement) {
  rewardsCount.innerHTML = `${app.rewardIndex + 1}/${app.claims.length} reward`;
  const attributeKey = "data-listener";

  if (nextTxButton && !nextTxButton.hasAttribute(attributeKey)) {
    nextTxButton.addEventListener("click", () => transactionHandler("next"));
    nextTxButton.setAttribute(attributeKey, "true");
  }

  if (prevTxButton && !prevTxButton.hasAttribute(attributeKey)) {
    prevTxButton.addEventListener("click", () => transactionHandler("previous"));
    prevTxButton.setAttribute(attributeKey, "true");
  }
}

function transactionHandler(direction: "next" | "previous") {
  removeAllEventListeners(getMakeClaimButton()) as HTMLButtonElement;
  direction === "next" ? app.nextPermit() : app.previousPermit();
  table.setAttribute(`data-make-claim`, "error");
  buttonController.hideViewClaim();
  buttonController.hideLoader();
  updateButtonVisibility(app).catch(console.error);
  initClaimGiftCard(app).catch(console.error);
  renderTransaction().catch(console.error);
}
