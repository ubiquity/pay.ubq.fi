import { app } from "./index";
import { insertNftTableData, insertTableData } from "./insert-table-data";
import { renderEnsName } from "./render-ens-name";
import { renderNftSymbol, renderTokenSymbol } from "./render-token-symbol";
import { setClaimMessage } from "./set-claim-message";
import { networkExplorers, NetworkIds } from "../constants";
import { hideClaimButton, loadingClaimButton, resetClaimButton, toaster } from "../toaster";
import { Value } from "@sinclair/typebox/value";
import { Type } from "@sinclair/typebox";
import { ClaimTx } from "./tx-type";
import { pay } from "../web3/pay";
import { ethers } from "ethers";
import { handleNetwork } from "../web3/wallet";

export async function init() {
  const table = document.getElementsByTagName(`table`)[0];

  // decode base64 to get tx data
  const urlParams = new URLSearchParams(window.location.search);
  const base64encodedTxData = urlParams.get("claim");

  if (!base64encodedTxData) {
    setClaimMessage({ type: "Notice", message: `No claim data found.` });
    table.setAttribute(`data-claim`, "none");
    return false;
  }

  try {
    const claimTxs = Value.Decode(Type.Array(ClaimTx), JSON.parse(atob(base64encodedTxData)));
    app.claimTxs = claimTxs;
  } catch (error) {
    console.error(error);
    setClaimMessage({ type: "Error", message: `Invalid claim data passed in URL` });
    table.setAttribute(`data-claim`, "error");
    return false;
  }

  let detailsVisible = false;

  table.setAttribute(`data-details-visible`, detailsVisible.toString());

  const additionalDetails = document.getElementById(`additionalDetails`) as Element;
  additionalDetails.addEventListener("click", () => {
    detailsVisible = !detailsVisible;
    table.setAttribute(`data-details-visible`, detailsVisible.toString());
  });

  renderTransaction();
}

type Success = boolean;
export async function renderTransaction(): Promise<Success> {
  const table = document.getElementsByTagName(`table`)[0];
  resetClaimButton();

  if (!app.currentTx) {
    hideClaimButton();
    return false;
  }

  handleNetwork(app.currentTx.networkId);

  if (app.currentTx.type === "permit") {
    // insert tx data into table
    const requestedAmountElement = insertTableData(app.currentTx, table);
    table.setAttribute(`data-claim`, "ok");

    renderTokenSymbol({
      tokenAddress: app.currentTx.permit.permitted.token,
      ownerAddress: app.currentTx.owner,
      networkId: app.currentTx.networkId,
      amount: app.currentTx.transferDetails.requestedAmount,
      explorerUrl: networkExplorers[app.currentTx.networkId],
      table,
      requestedAmountElement,
    }).catch(console.error);

    const toElement = document.getElementById(`transferDetails.to`) as Element;
    const fromElement = document.getElementById("owner") as Element;

    renderEnsName({ element: toElement, address: app.currentTx.transferDetails.to }).catch(console.error);
    renderEnsName({ element: fromElement, address: app.currentTx.owner, tokenAddress: app.currentTx.permit.permitted.token, tokenView: true }).catch(
      console.error,
    );

    await pay(app.currentTx);
  } else if (app.currentTx.type === "nft-mint") {
    const requestedAmountElement = insertNftTableData(app.currentTx, table);
    table.setAttribute(`data-claim`, "ok");

    renderNftSymbol({
      tokenAddress: app.currentTx.nftAddress,
      networkId: app.currentTx.networkId,
      explorerUrl: networkExplorers[app.currentTx.networkId],
      table,
      requestedAmountElement,
    }).catch(console.error);
  }

  return true;
}
