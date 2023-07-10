import { renderTransaction } from "./render-transaction/render-transaction";
import { pay } from "./web3";

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
    await renderTransaction();
    await pay();
  } catch (error) {
    console.error(error);
  }
})();
