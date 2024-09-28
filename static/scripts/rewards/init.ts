import { app } from "./app-state";
import { displayCommitHash } from "./render-transaction/display-commit-hash";
import { readClaimDataFromUrl } from "./render-transaction/read-claim-data-from-url";
import { grid } from "./the-grid";

displayCommitHash();
grid(document.getElementById("grid") as HTMLElement, gridLoadedCallback); // @DEV: display grid background
readClaimDataFromUrl(app).catch(console.error); // @DEV: read claim data from URL

const footer = document.querySelector("footer") as Element;
footer.classList.add("ready");

// cSpell:ignore llback
function gridLoadedCallback() {
  document.body.classList.add("grid-loaded");
}
