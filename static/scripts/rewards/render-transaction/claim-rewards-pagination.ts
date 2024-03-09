import { app } from "../app-state";
import { claimButton } from "../toaster";
import { table } from "./read-claim-data-from-url";
import { renderTransaction } from "./render-transaction";
import { removeAllEventListeners } from "./utils";

const nextTxButton = document.getElementById("nextTx");
const prevTxButton = document.getElementById("prevTx");

export function claimRewardsPagination(rewardsCount: HTMLElement) {
  rewardsCount.innerHTML = `${app.rewardIndex + 1}/${app.claims.length} reward`;

  if (nextTxButton) {
    nextTxButton.addEventListener("click", () => {
      claimButton.element = removeAllEventListeners(claimButton.element) as HTMLButtonElement;
      app.nextPermit();
      rewardsCount.innerHTML = `${app.rewardIndex + 1}/${app.claims.length} reward`;
      table.setAttribute(`data-claim`, "error");
      renderTransaction().catch(console.error);
    });
  }

  if (prevTxButton) {
    prevTxButton.addEventListener("click", () => {
      claimButton.element = removeAllEventListeners(claimButton.element) as HTMLButtonElement;
      app.previousPermit();
      rewardsCount.innerHTML = `${app.rewardIndex + 1}/${app.claims.length} reward`;
      table.setAttribute(`data-claim`, "error");
      renderTransaction().catch(console.error);
    });
  }
}
