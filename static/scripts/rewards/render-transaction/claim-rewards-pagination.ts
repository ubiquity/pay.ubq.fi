import { app } from "../app-state";
import { initClaimGiftCard } from "../gift-cards/index";
import { getMakeClaimButton } from "../button-controller";
import { table, updateButtonVisibility } from "./fetch-permits";
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
  console.time("updateButtonVisibility");
  updateButtonVisibility(app)
    .catch(console.error)
    .finally(() => console.timeEnd("updateButtonVisibility"));
  console.time("initClaimGiftCard");
  initClaimGiftCard(app)
    .catch(console.error)
    .finally(() => console.timeEnd("initClaimGiftCard"));
  console.time("renderTransaction");
  renderTransaction()
    .catch(console.error)
    .finally(() => console.timeEnd("renderTransaction"));
}
