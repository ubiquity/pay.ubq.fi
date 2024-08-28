import { ethers } from "ethers";
import { giftCardTreasuryAddress, permit2Address } from "../../../../../shared/constants";
import { isClaimableForAmount } from "../../../../../shared/pricing";
import { GiftCard, OrderRequestParams } from "../../../../../shared/types";
import { permit2Abi } from "../../abis";
import { AppState } from "../../app-state";
import { isErc20Permit } from "../../render-transaction/render-transaction";
import { toaster } from "../../toaster";
import { checkPermitClaimable, transferFromPermit, waitForTransaction } from "../../web3/erc20-permit";
import { getApiBaseUrl, getUserCountryCode } from "../helpers";
import { initClaimGiftCard } from "../index";

export function attachMintAction(giftCard: GiftCard, app: AppState) {
  const claimButtons: HTMLCollectionOf<Element> = document.getElementsByClassName("mint-btn");

  (claimButtons[0] as HTMLButtonElement).addEventListener("click", async () => {
    claimButtons[0].setAttribute("data-loading", "true");
    const productId = Number(document.getElementsByClassName("gift-card")[0].getAttribute("data-product-id"));

    if (!isErc20Permit(app.reward)) {
      toaster.create("error", "Only ERC20 permits are allowed to claim a card.");
    } else if (!isClaimableForAmount(giftCard, app.reward.amount)) {
      toaster.create("error", "Your reward amount is not equal to the price of available card.");
    } else {
      await mintGiftCard(productId, app);
    }

    claimButtons[0].setAttribute("data-loading", "false");
  });
}

async function mintGiftCard(productId: number, app: AppState) {
  if (app.signer) {
    const country = await getUserCountryCode();
    if (!country) {
      toaster.create("error", "Failed to detect your location to pick a suitable card for you.");
      return;
    }

    const isClaimable = await checkPermitClaimable(app);
    if (isClaimable) {
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
        country: country,
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

      toaster.create("success", "Gift card minted successfully.");
      await initClaimGiftCard(app);
    }
  } else {
    toaster.create("error", "Connect your wallet to proceed.");
  }
}
