import { app } from "../app-state";
import { initCollectGiftCard } from "../gift-cards/list-gift-cards";
import { getMakeClaimButton } from "../toaster";
import { table } from "./read-claim-data-from-url";
import { renderTransaction } from "./render-transaction";
import { removeAllEventListeners } from "./utils";

const nextTxButton = document.getElementById("nextTx");
const prevTxButton = document.getElementById("prevTx");

export function claimRewardsPagination(rewardsCount: HTMLElement) {
  rewardsCount.innerHTML = `${app.rewardIndex + 1}/${app.claims.length} reward`;
  if (nextTxButton) nextTxButton.addEventListener("click", () => transactionHandler("next"));
  if (prevTxButton) prevTxButton.addEventListener("click", () => transactionHandler("previous"));
}

function transactionHandler(direction: "next" | "previous") {
  removeAllEventListeners(getMakeClaimButton()) as HTMLButtonElement;
  direction === "next" ? app.nextPermit() : app.previousPermit();
  table.setAttribute(`data-make-claim`, "error");
  initCollectGiftCard(app).catch(console.error);
  renderTransaction().catch(console.error);
}
