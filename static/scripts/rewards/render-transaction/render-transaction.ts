import { JsonRpcProvider } from "@ethersproject/providers";
import { Type } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";
import { networkExplorers } from "../constants";
import { getOptimalProvider } from "../helpers";
import { claimButton, hideClaimButton, resetClaimButton } from "../toaster";
import { claimErc20PermitHandler, fetchTreasury, generateInvalidatePermitAdminControl } from "../web3/erc20-permit";
import { claimErc721PermitHandler } from "../web3/erc721-permit";
import { handleNetwork } from "../web3/wallet";
import { app } from "./index";
import { insertErc20PermitTableData, insertErc721PermitTableData } from "./insert-table-data";
import { renderEnsName } from "./render-ens-name";
import { renderNftSymbol, renderTokenSymbol } from "./render-token-symbol";
import { setClaimMessage } from "./set-claim-message";
import { claimTxT } from "./tx-type";
import { removeAllEventListeners } from "./utils";

let optimalRPC: JsonRpcProvider;

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
    const claimTxs = Value.Decode(Type.Array(claimTxT), JSON.parse(atob(base64encodedTxData)));
    app.claimTxs = claimTxs;
    optimalRPC = await getOptimalProvider(app.currentTx?.networkId ?? app.claimTxs[0].networkId);

    handleNetwork(app.currentTx?.networkId ?? app.claimTxs[0].networkId).catch(console.error);
  } catch (error) {
    console.error(error);
    setClaimMessage({ type: "Error", message: `Invalid claim data passed in URL` });
    table.setAttribute(`data-claim`, "error");
    return false;
  }

  let isDetailsVisible = false;

  table.setAttribute(`data-details-visible`, isDetailsVisible.toString());

  const additionalDetails = document.getElementById(`additionalDetails`) as Element;
  additionalDetails.addEventListener("click", () => {
    isDetailsVisible = !isDetailsVisible;
    table.setAttribute(`data-details-visible`, isDetailsVisible.toString());
  });

  const rewardsCount = document.getElementById("rewardsCount");
  if (rewardsCount) {
    if (!app.claimTxs || app.claimTxs.length <= 1) {
      // already hidden
    } else {
      rewardsCount.innerHTML = `${app.currentIndex + 1}/${app.claimTxs.length} reward`;

      const nextTxButton = document.getElementById("nextTx");
      if (nextTxButton) {
        nextTxButton.addEventListener("click", () => {
          claimButton.element = removeAllEventListeners(claimButton.element) as HTMLButtonElement;
          app.nextTx();
          rewardsCount.innerHTML = `${app.currentIndex + 1}/${app.claimTxs.length} reward`;
          table.setAttribute(`data-claim`, "none");
          renderTransaction(optimalRPC, true).catch(console.error);
        });
      }

      const prevTxButton = document.getElementById("previousTx");
      if (prevTxButton) {
        prevTxButton.addEventListener("click", () => {
          claimButton.element = removeAllEventListeners(claimButton.element) as HTMLButtonElement;
          app.previousTx();
          rewardsCount.innerHTML = `${app.currentIndex + 1}/${app.claimTxs.length} reward`;
          table.setAttribute(`data-claim`, "none");
          renderTransaction(optimalRPC, true).catch(console.error);
        });
      }

      setPagination(nextTxButton, prevTxButton);
    }
  }

  renderTransaction(optimalRPC, true).catch(console.error);
}

function setPagination(nextTxButton: Element | null, prevTxButton: Element | null) {
  if (!nextTxButton || !prevTxButton) return;
  if (app.claimTxs.length > 1) {
    prevTxButton.classList.remove("hide-pagination");
    nextTxButton.classList.remove("hide-pagination");

    prevTxButton.classList.add("show-pagination");
    nextTxButton.classList.add("show-pagination");
  }
}

type Success = boolean;
export async function renderTransaction(provider: JsonRpcProvider, nextTx?: boolean): Promise<Success> {
  const table = document.getElementsByTagName(`table`)[0];
  resetClaimButton();

  if (nextTx) {
    app.nextTx();
    if (!app.claimTxs || app.claimTxs.length <= 1) {
      // already hidden
    } else {
      setPagination(document.getElementById("nextTx"), document.getElementById("previousTx"));

      const rewardsCount = document.getElementById("rewardsCount") as Element;
      rewardsCount.innerHTML = `${app.currentIndex + 1}/${app.claimTxs.length} reward`;
      table.setAttribute(`data-claim`, "none");
    }
  }

  if (!app.currentTx) {
    hideClaimButton();
    return false;
  }

  handleNetwork(app.currentTx.networkId).catch(console.error);

  if (app.currentTx.type === "erc20-permit") {
    await handleErc20Permit(provider, table);
  } else if (app.currentTx.type === "erc721-permit") {
    handleErc721Permit(table, provider);
  }

  return true;
}

function handleErc721Permit(table: HTMLTableElement, provider: JsonRpcProvider) {
  const requestedAmountElement = insertErc721PermitTableData(app.currentTx, table);
  table.setAttribute(`data-claim`, "ok");

  renderNftSymbol({
    tokenAddress: app.currentTx.nftAddress,
    explorerUrl: networkExplorers[app.currentTx.networkId],
    table,
    requestedAmountElement,
    provider,
  }).catch(console.error);

  const toElement = document.getElementById(`rewardRecipient`) as Element;
  renderEnsName({ element: toElement, address: app.currentTx.request.beneficiary }).catch(console.error);

  claimButton.element.addEventListener("click", claimErc721PermitHandler(app.currentTx, provider));
}

async function handleErc20Permit(provider: JsonRpcProvider, table: HTMLTableElement) {
  const treasury = await fetchTreasury(app.currentTx, provider);

  // insert tx data into table
  const requestedAmountElement = insertErc20PermitTableData(app.currentTx, table, treasury);
  table.setAttribute(`data-claim`, "ok");

  renderTokenSymbol({
    tokenAddress: app.currentTx.permit.permitted.token,
    ownerAddress: app.currentTx.owner,
    amount: app.currentTx.transferDetails.requestedAmount,
    explorerUrl: networkExplorers[app.currentTx.networkId],
    table,
    requestedAmountElement,
    provider,
  }).catch(console.error);

  const toElement = document.getElementById(`rewardRecipient`) as Element;
  renderEnsName({ element: toElement, address: app.currentTx.transferDetails.to }).catch(console.error);

  generateInvalidatePermitAdminControl(app.currentTx).catch(console.error);

  claimButton.element.addEventListener("click", claimErc20PermitHandler(app.currentTx, optimalRPC));
}
