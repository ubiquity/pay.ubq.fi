import { isAllowed } from "../../../shared/allowed-country-list";
import { getGiftCardOrderId, getRevealMessageToSign, isGiftCardAvailable } from "../../../shared/helpers";
import { GiftCard, OrderTransaction, RedeemCode } from "../../../shared/types";
import { getUserCountryCode } from "../rewards/gift-cards/helpers";
import { getRedeemCodeHtml } from "../rewards/gift-cards/reveal/redeem-code-html";
import { isClaimableForAmount } from "../../../shared/pricing";

import { BigNumberish, ethers } from "ethers";
import { parseUnits } from "ethers/lib/utils";
import { erc20Abi } from "../rewards/abis";
import { TransactionResponse } from "@ethersproject/providers";
import { giftCardTreasuryAddress, ubiquityDollarChainAddresses } from "../../../shared/constants";
import { app } from "./app-state";
import { ubiquityDollarAllowedChainIds } from "../../../shared/constants";
import { getGiftCardHtml } from "../rewards/gift-cards/gift-card";
import { showTransactionHistory } from "./transaction-history";
import { getOrder, postOrder, getBestCard, getRedeemCode } from "../shared/api";
import { toaster } from "../rewards/toaster";

const loaderAttribute = "data-loading";

export async function initClaimGiftCard() {
  showTransactionHistory();

  const checkButton = document.getElementById("check-gift-card");
  if (!checkButton) {
    console.error("Missing check button #check-gift-card");
    return;
  }

  checkButton.addEventListener("click", async () => {
    if (checkButton.getAttribute(loaderAttribute) === "true") {
      return;
    }

    checkButton.setAttribute(loaderAttribute, "true");
    await showBestCard();
    checkButton.setAttribute(loaderAttribute, "false");
  });
}

export async function showBestCard() {
  const giftCardsSection = document.getElementById("gift-cards");
  if (!giftCardsSection) {
    console.error("Missing gift cards section #gift-cards");
    return;
  }

  const amountInput = document.getElementById("ubiquity-dollar-amount") as HTMLInputElement;
  if (!amountInput) {
    console.error("Missing amount input #ubiquity-dollar-amount");
    return;
  }
  if (!amountInput.value) {
    toaster.create("error", "Amount is not set");
    return;
  }

  const countryCode = await getUserCountryCode();
  if (!countryCode) {
    giftCardsSection.innerHTML = `<p class="card-error">Failed to load suitable virtual cards for you. Refresh or try disabling adblocker.</p>`;
    return;
  }

  if (!isAllowed(countryCode)) {
    giftCardsSection.innerHTML = `<p class="card-error">Virtual cards are not available for your location. Use other methods to claim your reward.</p>`;
    return;
  }

  const amountInWei = parseUnits(amountInput.value, 18);
  if (amountInWei.lte(0)) {
    toaster.create("error", "Amount must be greater than 0.");
    return;
  }

  const giftCard = await getBestCard({ country: countryCode, amount: amountInWei.toString() });

  if (giftCard) {
    app.clear();
    app.transaction.setProduct(giftCard.productId, countryCode, amountInWei);
    const availableGiftCard = isGiftCardAvailable(giftCard, amountInWei) ? giftCard : null;

    addAvailableCardsHtml(availableGiftCard, giftCardsSection, amountInWei);
  } else {
    giftCardsSection.innerHTML = "<p class='card-error'>There are no card available to claim at the moment.</p>";
  }
}

export async function showPurchasedCard(orderId: string) {
  const order = await getOrder({ orderId });
  if (!order) {
    toaster.create("error", "Failed to load your virtual card.");
    return;
  }
  const { transaction, product: giftCard } = order;

  const htmlParts: string[] = [];
  htmlParts.push(`<h2 class="card-heading">Your virtual card</h2>`);
  htmlParts.push(getRedeemCodeHtml(transaction));
  if (giftCard) {
    htmlParts.push(getGiftCardHtml(giftCard, app.transaction.amount ?? 0));
  }
  const giftCardsSection = document.getElementById("gift-cards");
  if (!giftCardsSection) {
    console.error("Missing gift cards section #gift-cards");
    return;
  }
  giftCardsSection.innerHTML = htmlParts.join("");
  attachRevealAction(transaction);
}

function addAvailableCardsHtml(giftCard: GiftCard | null, giftCardsSection: HTMLElement, amount: BigNumberish) {
  const htmlParts: string[] = [];

  if (giftCard) {
    htmlParts.push(getGiftCardHtml(giftCard, amount));
    giftCardsSection.innerHTML = htmlParts.join("");
    attachMintAction(giftCard);
  } else {
    htmlParts.push(`<p class="card-error">There are no cards available to mint at the moment.</p>`);
    giftCardsSection.innerHTML = htmlParts.join("");
  }
}

export function attachMintAction(giftCard: GiftCard) {
  const mintBtn: HTMLElement | null = document.getElementById("mint");

  mintBtn?.addEventListener("click", async () => {
    mintBtn.setAttribute(loaderAttribute, "true");
    const productId = Number(document.getElementById("offered-card")?.getAttribute("data-product-id"));
    const amount = app.transaction.amount;
    if (!amount) {
      toaster.create("error", "Amount is not set.");
      return;
    }

    if (!isClaimableForAmount(giftCard, amount)) {
      toaster.create("error", "Your reward amount is not equal to the price of available card.");
    } else {
      await mintGiftCard(productId);
    }

    mintBtn.setAttribute(loaderAttribute, "false");
  });
}

async function mintGiftCard(productId: number) {
  const country = await getUserCountryCode();
  if (!country) {
    toaster.create("error", "Failed to detect your location to pick a suitable card for you.");
    return;
  }
  const amount = app.transaction.amount;
  if (!amount) {
    toaster.create("error", "Amount is not set.");
    return;
  }

  const provider = new ethers.providers.Web3Provider(window.ethereum);
  await provider.send("eth_requestAccounts", []);
  const signer = provider.getSigner();
  const wallet = await signer.getAddress();
  const chainId = provider.network.chainId;

  if (!ubiquityDollarAllowedChainIds.includes(chainId)) {
    toaster.create("error", "You are not on the correct network to mint the card.");
    return;
  }

  const ubiquityDollarErc20Address = ubiquityDollarChainAddresses[chainId];
  const erc20Contract = new ethers.Contract(ubiquityDollarErc20Address, erc20Abi, signer);

  const tx: TransactionResponse = await erc20Contract.transfer(giftCardTreasuryAddress, amount);
  await tx.wait();

  const txHash = tx.hash;
  app.transaction.setTxHash(txHash, wallet, chainId);
  const orderId = getGiftCardOrderId(wallet, txHash);

  const order = await postOrder({
    type: "ubiquity-dollar",
    chainId: provider.network.chainId,
    txHash: txHash,
    productId,
    country: country,
  });
  if (!order) {
    toaster.create("error", "Order failed. Try again later.");
    return;
  }
  app.transaction.setReloadlyTransactionId(order.transactionId);

  await checkForMintingDelay(orderId);
}

async function checkForMintingDelay(orderId: string) {
  if (await hasMintingFinished(orderId)) {
    await showPurchasedCard(orderId);
  } else {
    const interval = setInterval(async () => {
      if (await hasMintingFinished(orderId)) {
        clearInterval(interval);
        await showPurchasedCard(orderId);
      } else {
        toaster.create("info", "Minting is in progress. Please wait...");
      }
    }, 10000);
    toaster.create("info", "Minting is in progress. Please wait...");
  }
}

async function hasMintingFinished(orderId: string): Promise<boolean> {
  return (await getOrder({ orderId })) != null;
}

export function attachRevealAction(transaction: OrderTransaction) {
  const revealBtn = document.getElementById("reveal");

  revealBtn?.addEventListener("click", async () => {
    revealBtn.setAttribute(loaderAttribute, "true");
    const transactionId = document.getElementById("redeem-code")?.getAttribute("data-transaction-id");
    const wallet = new ethers.providers.Web3Provider(window.ethereum);
    await wallet.send("eth_requestAccounts", []);
    const signer = wallet.getSigner();
    const address = await signer.getAddress();

    const txHash = app.transaction.txHash;
    if (!txHash) {
      toaster.create("error", "Transaction hash is not set.");
      revealBtn.setAttribute(loaderAttribute, "false");
      return;
    }

    if (signer && transactionId) {
      try {
        const signedMessage = await signer.signMessage(getRevealMessageToSign(Number(transactionId)));
        await revealRedeemCode(transaction.transactionId, address, txHash, signedMessage);
      } catch (error) {
        toaster.create("error", "User did not sign the message to reveal redeem code.");
        revealBtn.setAttribute(loaderAttribute, "false");
      }
    } else {
      toaster.create("error", "Connect your wallet to reveal the redeem code.");
    }
    revealBtn.setAttribute(loaderAttribute, "false");
  });
}

async function revealRedeemCode(transactionId: number, wallet: string, txHash: string, signedMessage: string) {
  const redeemCodes = await getRedeemCode({
    transactionId: transactionId,
    signedMessage: signedMessage,
    wallet: wallet,
    permitSig: txHash,
  });
  if (!redeemCodes) {
    toaster.create("error", `Redeem code can't be revealed to the connected wallet.`);
    return;
  }

  const redeemCodeElement = document.getElementById("redeem-code");
  if (redeemCodeElement) {
    let codesHtml = "<h3>Redeem code</h3>";
    redeemCodes.forEach((code) => {
      const keys = Object.keys(code);
      keys.forEach((key) => {
        codesHtml += `<p>${key}: ${code[key as keyof RedeemCode]}</p>`;
      });
    });
    redeemCodeElement.innerHTML = codesHtml;
  }
}
