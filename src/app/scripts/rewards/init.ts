import { webAuthn } from "./account-abstraction/webauthn";

displayCommitHash(); // @DEV: display commit hash in footer

declare const commitHash: string; // @DEV: passed in at build time check build/esbuild-build.ts
function displayCommitHash() {
  // display commit hash in footer
  const buildElement = document.querySelector(`#build a`) as HTMLAnchorElement;
  buildElement.innerHTML = commitHash;
  buildElement.href = `https://github.com/ubiquity/pay.ubq.fi/commit/${commitHash}`;
}
