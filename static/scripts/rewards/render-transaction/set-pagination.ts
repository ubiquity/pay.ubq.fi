import { app } from "../app-state";

export function setPagination(nextTxButton: Element | null, prevTxButton: Element | null) {
  if (!nextTxButton || !prevTxButton) return;
  if (app.claims.length > 1) {
    prevTxButton.classList.remove("hide-pagination");
    nextTxButton.classList.remove("hide-pagination");

    prevTxButton.classList.add("show-pagination");
    nextTxButton.classList.add("show-pagination");
  }
}
