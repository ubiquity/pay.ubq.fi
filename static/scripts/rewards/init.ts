import { app } from "./app-state";
import { readClaimDataFromUrl } from "./render-transaction/read-claim-data-from-url";
import { grid } from "./the-grid";

grid(document.getElementById("grid") as HTMLElement, gridLoadedCallback); // @DEV: display grid background

readClaimDataFromUrl(app).catch(console.error); // @DEV: read claim data from URL

// cSpell:ignore llback
function gridLoadedCallback() {
  document.body.classList.add("grid-loaded");
}
