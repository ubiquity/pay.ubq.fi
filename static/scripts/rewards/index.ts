import { renderTransaction } from "./render-transaction/render-transaction";
import { pay } from "./web3/pay";
import { grid } from "./the-grid";
import { claimButton, toaster } from "./toaster";
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
    const success = await renderTransaction();
    if (success) {
      await pay();
    }
  } catch (error: any) {
    if (error.message.includes("unknown account #0")) {
      const showToaster = () => toaster.create("info", "Connect your wallet to collect this reward.");
      claimButton.element.addEventListener("click", showToaster);
      claimButton.element.click();
      claimButton.element.removeEventListener("click", showToaster);
      claimButton.element.addEventListener("click", async () => await pay(true));
    } else {
      console.error(error);
    }
  }
})();

grid(document.getElementById("grid") as HTMLElement);
