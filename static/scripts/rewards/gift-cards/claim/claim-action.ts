import { ethers } from "ethers";
import { permit2Abi } from "../../abis";
import { AppState } from "../../app-state";
import { permit2Address } from "../../../../../shared/constants";
import { giftCardTreasuryAddress } from "../../../../../shared/constants";
import { toaster } from "../../toaster";
import { isNonceClaimed, transferFromPermit, waitForTransaction } from "../../web3/erc20-permit";
import { getApiBaseUrl } from "../helpers";
import { isProductAvailableForAmount } from "../../../../../shared/helpers";
import { OrderRequestParams, ReloadlyProduct } from "../../../../../shared/types";

export function attachClaimAction(className: string, giftcards: ReloadlyProduct[], app: AppState) {
  const claimButtons: HTMLCollectionOf<Element> = document.getElementsByClassName(className);
  Array.from(claimButtons).forEach((claimButton: Element) => {
    (claimButton as HTMLButtonElement).addEventListener("click", async () => {
      claimButton.setAttribute("data-loading", "true");
      const productId = Number(claimButton.parentElement?.parentElement?.parentElement?.getAttribute("data-product-id"));

      const product = giftcards.find((product: ReloadlyProduct) => product.productId == productId);
      if (product) {
        if (!isProductAvailableForAmount(product, app.reward.amount)) {
          toaster.create("error", "Your reward amount is not equal to the price of available card.");
        } else {
          await claimGiftCard(productId, app);
        }
      }
      claimButton.setAttribute("data-loading", "false");
    });
  });
}

async function claimGiftCard(productId: number, app: AppState) {
  if (app.signer) {
    if ((await app.signer.getAddress()) != app.reward.beneficiary) {
      toaster.create("error", "The connected wallet is not the beneficiary of the reward.");
      return;
    }
    const isClaimed = await isNonceClaimed(app);
    if (isClaimed) {
      toaster.create("error", "Reward has been claimed already.");
      return;
    }

    const permit2Contract = new ethers.Contract(permit2Address, permit2Abi, app.signer);
    if (!permit2Contract) return;

    const reward = {
      ...app.reward,
    };
    reward.beneficiary = giftCardTreasuryAddress;

    const tx = await transferFromPermit(permit2Contract, reward);
    if (!tx) return;
    await waitForTransaction(tx, `Payment confirmed. Claiming card now...`);

    const url = `${getApiBaseUrl()}/post-order`;

    const orderParams: OrderRequestParams = {
      chainId: app.signer.provider.network.chainId,
      txHash: tx.hash,
      productId,
    };
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Accept: "application/json",
      },
      body: JSON.stringify(orderParams),
    });

    if (response.status != 200) {
      toaster.create("error", "Order failed. Try again later.");
      return;
    }

    toaster.create("success", "Gift card claimed successfully.");
    window.location.reload();
  } else {
    toaster.create("error", "Connect your wallet to proceed.");
  }
}
