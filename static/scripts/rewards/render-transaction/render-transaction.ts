import { app } from "./index";
import { insertNftTableData, insertPermitTableData } from "./insert-table-data";
import { renderEnsName } from "./render-ens-name";
import { renderNftSymbol, renderTokenSymbol } from "./render-token-symbol";
import { setClaimMessage } from "./set-claim-message";
import { networkExplorers } from "../constants";
import { claimButton, hideClaimButton, resetClaimButton } from "../toaster";
import { Value } from "@sinclair/typebox/value";
import { Type } from "@sinclair/typebox";
import { ClaimTx } from "./tx-type";
import { handleNetwork } from "../web3/wallet";
import { mintNftHandler } from "../web3/nft-mint";
import { claimPermitHandler, fetchTreasury, generateInvalidatePermitAdminControl } from "../web3/permit";

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

  const rewardsCount = document.getElementById("rewardsCount");
  if (rewardsCount) {
    rewardsCount.innerHTML = `${app.currentIndex + 1}/${app.claimTxs.length} reward`;

    const nextTxButton = document.getElementById("nextTx");
    if (nextTxButton) {
      nextTxButton.addEventListener("click", () => {
        app.nextTx();
        rewardsCount.innerHTML = `${app.currentIndex + 1}/${app.claimTxs.length} reward`;
        table.setAttribute(`data-claim`, "none");
        renderTransaction();
      });
    }

    const prevTxButton = document.getElementById("previousTx");
    if (prevTxButton) {
      prevTxButton.addEventListener("click", () => {
        app.previousTx();
        rewardsCount.innerHTML = `${app.currentIndex + 1}/${app.claimTxs.length} reward`;
        table.setAttribute(`data-claim`, "none");
        renderTransaction();
      });
    }
  }

  renderTransaction();
}

type Success = boolean;
export async function renderTransaction(nextTx?: boolean): Promise<Success> {
  const table = document.getElementsByTagName(`table`)[0];
  resetClaimButton();

  if (nextTx) {
    app.nextTx();
    const rewardsCount = document.getElementById("rewardsCount") as Element;
    rewardsCount.innerHTML = `${app.currentIndex + 1}/${app.claimTxs.length} reward`;
    table.setAttribute(`data-claim`, "none");
  }

  if (!app.currentTx) {
    hideClaimButton();
    return false;
  }

  handleNetwork(app.currentTx.networkId);

  if (app.currentTx.type === "permit") {
    const treasury = await fetchTreasury(app.currentTx);

    // insert tx data into table
    const requestedAmountElement = insertPermitTableData(app.currentTx, table, treasury);
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

    const toElement = document.getElementById(`rewardRecipient`) as Element;
    renderEnsName({ element: toElement, address: app.currentTx.transferDetails.to });

    generateInvalidatePermitAdminControl(app.currentTx);

    claimButton.element.addEventListener("click", claimPermitHandler(app.currentTx));
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

    const toElement = document.getElementById(`rewardRecipient`) as Element;
    renderEnsName({ element: toElement, address: app.currentTx.request.beneficiary });

    claimButton.element.addEventListener("click", mintNftHandler(app.currentTx));
  }

  return true;
}
