import { ethers } from "ethers";
import { permit2Abi } from "../../abis";
import { AppState } from "../../app-state";
import { permit2Address } from "../../../../../shared/constants";
import { giftCardTreasuryAddress } from "../../../../../shared/constants";
import { toaster } from "../../toaster";
import { checkPermitClaimable, transferFromPermit, waitForTransaction } from "../../web3/erc20-permit";
import { getApiBaseUrl } from "../helpers";
import { isClaimableForAmount } from "../../../../../shared/pricing";
import { OrderRequestParams, GiftCard } from "../../../../../shared/types";
import { isErc20Permit } from "../../render-transaction/render-transaction";
import { initClaimGiftCard } from "../list-gift-cards";

export function attachClaimAction(className: string, giftCard: GiftCard, app: AppState) {
  const claimButtons: HTMLCollectionOf<Element> = document.getElementsByClassName(className);
  Array.from(claimButtons).forEach((claimButton: Element) => {
    (claimButton as HTMLButtonElement).addEventListener("click", async () => {
      claimButton.setAttribute("data-loading", "true");
      const productId = Number(claimButton.parentElement?.parentElement?.parentElement?.getAttribute("data-product-id"));

      if (!isErc20Permit(app.reward)) {
        toaster.create("error", "Only ERC20 permits are allowed to claim a card.");
      } else if (!isClaimableForAmount(giftCard, app.reward.amount)) {
        toaster.create("error", "Your reward amount is not equal to the price of available card.");
      } else {
        await claimGiftCard(productId, app);
      }

      claimButton.setAttribute("data-loading", "false");
    });
  });
}

async function claimGiftCard(productId: number, app: AppState) {
  if (app.signer) {
    await checkPermitClaimable(app);
    const permit2Contract = new ethers.Contract(permit2Address, permit2Abi, app.signer);
    if (!permit2Contract) return;

    const reward = {
      ...app.reward,
    };
    reward.beneficiary = giftCardTreasuryAddress;

    const tx = await transferFromPermit(permit2Contract, reward, "Processing... Please wait. Do not close this page.");
    if (!tx) return;
    await waitForTransaction(tx, `Transaction confirmed. Loading your card now.`);

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
    await initClaimGiftCard(app);
  } else {
    toaster.create("error", "Connect your wallet to proceed.");
  }
}
