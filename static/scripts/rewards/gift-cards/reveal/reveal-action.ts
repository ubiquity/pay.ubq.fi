import { getRevealMessageToSign } from "../../../../../shared/helpers";
import { RedeemCode, OrderTransaction } from "../../../../../shared/types";
import { AppState } from "../../app-state";
import { toaster } from "../../toaster";
import { getApiBaseUrl } from "../helpers";

export function attachRevealAction(transaction: OrderTransaction, app: AppState) {
  const revealBtn = document.getElementById("reveal");
  const loaderAttribute = "data-loading";
  revealBtn?.addEventListener("click", async () => {
    revealBtn.setAttribute(loaderAttribute, "true");
    const transactionId = document.getElementById("redeem-code")?.getAttribute("data-transaction-id");
    if (app?.signer && transactionId) {
      try {
        const signedMessage = await app.signer.signMessage(getRevealMessageToSign(Number(transactionId)));
        await revealRedeemCode(transaction.transactionId, signedMessage, app);
      } catch (error) {
        toaster.create("error", "You did not sign the message to reveal redeem code.");
        revealBtn.setAttribute(loaderAttribute, "false");
      }
    } else {
      toaster.create("error", "Connect your wallet to reveal the redeem code.");
    }
    revealBtn.setAttribute(loaderAttribute, "false");
  });
}

async function revealRedeemCode(transactionId: number, signedMessage: string, app: AppState) {
  const requestInit = {
    method: "GET",
    headers: {
      Accept: "application/json",
    },
  };

  const response = await fetch(
    `${getApiBaseUrl()}/get-redeem-code?transactionId=${transactionId}&signedMessage=${signedMessage}&wallet=${await app.signer?.getAddress()}&permitSig=${app.reward.signature}`,
    requestInit
  );

  if (response.status != 200) {
    toaster.create("error", `Redeem code can't be revealed to the connected wallet.`);
    return;
  }

  const responseJson = (await response.json()) as RedeemCode[];

  const redeemCodeElement = document.getElementById("redeem-code");
  if (redeemCodeElement) {
    let codesHtml = "<h3>Redeem code</h3>";
    responseJson.forEach((code) => {
      const keys = Object.keys(code);
      keys.forEach((key) => {
        codesHtml += `<p>${key}: ${code[key as keyof RedeemCode]}</p>`;
      });
    });
    redeemCodeElement.innerHTML = codesHtml;
  }
}
