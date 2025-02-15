import { ethers } from "ethers";
import { giftCardTreasuryAddress, permit2Address, networkToCardMinterToken } from "../../../../../shared/constants";
import { isClaimableForAmount } from "../../../../../shared/pricing";
import { GiftCard } from "../../../../../shared/types";
import { permit2Abi } from "../../abis";
import { AppState } from "../../app-state";
import { isErc20Permit } from "../../render-transaction/render-transaction";
import { toaster } from "../../toaster";
import { checkPermitClaimable, transferFromPermit, waitForTransaction } from "../../web3/erc20-permit";
import { getApiBaseUrl, getUserCountryCode } from "../helpers";
import { initClaimGiftCard } from "../index";
import { getGiftCardOrderId, getMintMessageToSign } from "../../../../../shared/helpers";
import { postOrder } from "../../../shared/api";
import { getIncompleteMintTx, removeIncompleteMintTx, storeIncompleteMintTx } from "./mint-tx-tracker";
import { PostOrderParams } from "../../../../../shared/api-types";

export function attachMintAction(giftCard: GiftCard, app: AppState) {
  const mintBtn: HTMLElement | null = document.getElementById("mint");

  mintBtn?.addEventListener("click", async () => {
    mintBtn.setAttribute("data-loading", "true");
    const productId = Number(document.getElementById("offered-card")?.getAttribute("data-product-id"));

    if (!isErc20Permit(app.reward)) {
      toaster.create("error", "Only ERC20 permits are allowed to claim a card.");
    } else if (app.reward.tokenAddress.toLowerCase() !== networkToCardMinterToken[app.reward.networkId].toLowerCase()) {
      toaster.create("error", `<a href="https://dao.ubq.fi/card-minting" target="_blank">Payment card can be minted only with Ubiquity Dollar permit.</a>`);
    } else if (!isClaimableForAmount(giftCard, app.reward.amount)) {
      toaster.create("error", "Your reward amount is not equal to the price of available card.");
    } else {
      await mintGiftCard(productId, app);
    }

    mintBtn.setAttribute("data-loading", "false");
  });
}

async function mintGiftCard(productId: number, app: AppState) {
  if (!app.signer) {
    toaster.create("error", "Connect your wallet.");
    return;
  }

  const country = await getUserCountryCode();
  if (!country) {
    toaster.create("error", "Failed to detect your location to pick a suitable card for you.");
    return;
  }

  const txHash: string = getIncompleteMintTx(app.reward.nonce) || (await claimPermitToCardTreasury(app));

  if (txHash) {
    let signedMessage;
    try {
      signedMessage = await app.signer.signMessage(getMintMessageToSign("permit", app.signer.provider.network.chainId, txHash, productId, country));
    } catch (error) {
      toaster.create("error", "You did not sign the message to mint a payment card.");
      return;
    }

    const order = await postOrder({
      type: "permit",
      chainId: app.signer.provider.network.chainId,
      txHash: txHash,
      productId,
      country: country,
      signedMessage: signedMessage,
    } as PostOrderParams);

    if (!order) {
      toaster.create("error", "Order failed. Try again in a few minutes.");
      return;
    }
    await checkForMintingDelay(app);
  }
}

async function checkForMintingDelay(app: AppState) {
  if (await hasMintingFinished(app)) {
    removeIncompleteMintTx(app.reward.nonce);
    await initClaimGiftCard(app);
  } else {
    const interval = setInterval(async () => {
      if (await hasMintingFinished(app)) {
        clearInterval(interval);
        await initClaimGiftCard(app);
      } else {
        toaster.create("info", "Minting is in progress. Please wait...");
      }
    }, 10000);
    toaster.create("info", "Minting is in progress. Please wait...");
  }
}

async function claimPermitToCardTreasury(app: AppState) {
  if (!app.signer) {
    toaster.create("error", "Connect your wallet.");
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

    storeIncompleteMintTx(app.reward.nonce, tx.hash);
    await waitForTransaction(tx, `Transaction confirmed. Minting your card now.`, app.signer.provider.network.chainId);
    return tx.hash;
  }
}

async function hasMintingFinished(app: AppState): Promise<boolean> {
  const retrieveOrderUrl = `${getApiBaseUrl()}/get-order?orderId=${getGiftCardOrderId(app.reward.beneficiary, app.reward.signature)}`;
  const orderResponse = await fetch(retrieveOrderUrl, {
    method: "GET",
    headers: {
      Accept: "application/json",
    },
  });

  return orderResponse.status != 404;
}
