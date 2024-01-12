import { init } from "./render-transaction/render-transaction";
import { grid } from "./the-grid";

(async function appAsyncWrapper() {
  try {
    // display commit hash
    const commit = await fetch("commit.txt");
    if (commit.ok) {
      const commitHash = await commit.text();
      const buildElement = document.querySelector(`#build a`) as HTMLAnchorElement;
      buildElement.innerHTML = commitHash;
      buildElement.href = `https://github.com/ubiquity/pay.ubq.fi/commit/${commitHash}`;
    }
    init();
  } catch (error) {
    console.error(error);
  }
})();

grid(document.getElementById("grid") as HTMLElement);
