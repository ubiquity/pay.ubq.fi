import { app } from "../app-state";
import { claimButton } from "../toaster";
import { table } from "./read-claim-data-from-url";
import { renderTransaction } from "./render-transaction";
import { setPagination } from "./set-pagination";
import { removeAllEventListeners } from "./utils";

export function claimRewardsPagination(rewardsCount: HTMLElement) {
  rewardsCount.innerHTML = `${app.transactionIndex + 1}/${app.claims.length} reward`;

  const nextTxButton = document.getElementById("nextTx");
  if (nextTxButton) {
    nextTxButton.addEventListener("click", () => {
      claimButton.element = removeAllEventListeners(claimButton.element) as HTMLButtonElement;
      app.nextTx();
      rewardsCount.innerHTML = `${app.transactionIndex + 1}/${app.claims.length} reward`;
      table.setAttribute(`data-claim`, "none");
      renderTransaction(true).catch(console.error);
    });
  }

  const prevTxButton = document.getElementById("previousTx");
  if (prevTxButton) {
    prevTxButton.addEventListener("click", () => {
      claimButton.element = removeAllEventListeners(claimButton.element) as HTMLButtonElement;
      app.previousTx();
      rewardsCount.innerHTML = `${app.transactionIndex + 1}/${app.claims.length} reward`;
      table.setAttribute(`data-claim`, "none");
      renderTransaction(true).catch(console.error);
    });
  }

  setPagination(nextTxButton, prevTxButton);
}
