import { init } from "./render-transaction/render-transaction";
import { grid } from "./the-grid";

declare const commitHash: string; // @DEV: passed in at build time check build/esbuild-build.ts

(async function appAsyncWrapper() {
  // display commit hash
  const buildElement = document.querySelector(`#build a`) as HTMLAnchorElement;
  buildElement.innerHTML = commitHash;
  buildElement.href = `https://github.com/ubiquity/pay.ubq.fi/commit/${commitHash}`;

  init().catch(console.error);
  grid(document.getElementById("grid") as HTMLElement);
})().catch(console.error);
