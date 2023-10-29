import { renderTransaction } from "./render-transaction/render-transaction";
import { AccountAbstraction, pay } from "./web3/pay";
import { grid } from "./the-grid";
import { claimButton, loginButton, toaster } from "./toaster";
import { ethers } from "ethers";
// import AccountAbstraction from "./web3/accountAbstraction";
let provider = new ethers.providers.Web3Provider(window.ethereum);

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
    loginButton.element.addEventListener("click", await AccountAbstraction(provider));
    loginButton.element.click();
    loginButton.element.removeEventListener("click", await AccountAbstraction(provider));
  } catch (error: any) {
    console.log("appAsyncWrapper error: ", error);
    if (error.message.includes("unknown account #0")) {
      toaster.create("error", "Please connect your wallet");
      loginButton.element.addEventListener("click", await AccountAbstraction(provider, true));
      claimButton.element.style.display = "none";
    } else {
      console.error(error);
    }
  }
})();

grid(document.getElementById("grid") as HTMLElement);
