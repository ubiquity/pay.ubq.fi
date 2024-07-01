import { app } from "./app-state";
import { readClaimDataFromUrl } from "./render-transaction/read-claim-data-from-url";
import { grid } from "./the-grid";

grid(document.getElementById("grid") as HTMLElement, gridLoadedCallback); // @DEV: display grid background

readClaimDataFromUrl(app).catch(console.error); // @DEV: read claim data from URL

declare const commitHash: string; // @DEV: passed in at build time check build/esbuild-build.ts
export function displayCommitHash() {
  // display commit hash in footer
  const buildElement = document.querySelector(`#build a`) as HTMLAnchorElement;
  buildElement.innerHTML = commitHash;
  buildElement.href = `https://github.com/ubiquity/pay.ubq.fi/commit/${commitHash}`;
}

// cSpell:ignore llback
function gridLoadedCallback() {
  document.body.classList.add("grid-loaded");
}
