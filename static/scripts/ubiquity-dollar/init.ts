import { initClaimGiftCard } from "./gift-card";
import { displayCommitHash } from "../rewards/render-transaction/display-commit-hash";
import { grid } from "../rewards/the-grid";

displayCommitHash();

grid(document.getElementById("grid") as HTMLElement, () => {
  document.body.classList.add("grid-loaded");
});

const footer = document.querySelector(".footer") as Element;
footer.classList.add("ready");

initClaimGiftCard().catch(console.error);
