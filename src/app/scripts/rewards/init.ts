import { webAuthn } from "./account-abstraction/webauthn";
import { app } from "./app-state";
import { grid } from "./the-grid";

displayCommitHash(); // @DEV: display commit hash in footer
grid(document.getElementById("grid") as HTMLElement, gridLoadedCallback); // @DEV: display grid background
webAuthn().catch(console.error); // @DEV: setup webauthn

declare const commitHash: string; // @DEV: passed in at build time check build/esbuild-build.ts
function displayCommitHash() {
  // display commit hash in footer
  const buildElement = document.querySelector(`#build a`) as HTMLAnchorElement;
  buildElement.innerHTML = commitHash;
  buildElement.href = `https://github.com/ubiquity/pay.ubq.fi/commit/${commitHash}`;
}

// cSpell:ignore llback
function gridLoadedCallback() {
  document.body.classList.add("grid-loaded");
}
