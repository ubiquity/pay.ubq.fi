import { app } from "./app-state";
import { initializeAuth } from "./auth";
import { initClaimGiftCard } from "./gift-cards/index";
import { displayCommitHash } from "./render-transaction/display-commit-hash";
import { fetchPermits } from "./render-transaction/fetch-permits";
import { grid } from "./the-grid";
import { syncLocalStorageTransactions } from "./web3/erc20-permit";

initializeAuth();
displayCommitHash();
grid(document.getElementById("grid") as HTMLElement, gridLoadedCallback); // @DEV: display grid background
fetchPermits(app).catch(console.error); // @DEV: read claim data from URL
syncLocalStorageTransactions().catch(console.error); // @DEV: try to write claimed permits tx hashes into supabase

const footer = document.querySelector(".footer") as Element;
footer.classList.add("ready");

// cSpell:ignore llback
function gridLoadedCallback() {
  document.body.classList.add("grid-loaded");
}

initClaimGiftCard(app).catch(console.error);
