import { app } from "../app-state";
import { networkExplorers } from "../constants";
import { claimButton, hideClaimButton, hideLoader, hideViewClaimButton, showClaimButton, showViewClaimButton, viewClaimButton } from "../toaster";
import { claimErc20PermitHandlerWrapper, fetchTreasury, generateInvalidatePermitAdminControl } from "../web3/erc20-permit";
import { claimErc721PermitHandler } from "../web3/erc721-permit";
import { verifyCurrentNetwork } from "../web3/verify-current-network";
import { insertErc20PermitTableData, insertErc721PermitTableData } from "./insert-table-data";
import { renderEnsName } from "./render-ens-name";
import { renderNftSymbol, renderTokenSymbol } from "./render-token-symbol";
import { RewardPermit, Erc20Permit } from "./tx-type";

function setPagination(nextTxButton: Element | null, prevTxButton: Element | null) {
  if (!nextTxButton || !prevTxButton) return;
  if (app.claims.length > 1) {
    prevTxButton.classList.remove("hide-pagination");
    nextTxButton.classList.remove("hide-pagination");

    prevTxButton.classList.add("show-pagination");
    nextTxButton.classList.add("show-pagination");
  }
}

type Success = boolean;
export async function renderTransaction(nextTx?: boolean): Promise<Success> {
  const table = document.getElementsByTagName(`table`)[0];

  if (nextTx) {
    app.nextPermit();

    if (!app.claims || app.claims.length <= 1) {
      // already hidden
    } else {
      setPagination(document.getElementById("nextTx"), document.getElementById("prevTx"));

      const rewardsCount = document.getElementById("rewardsCount") as Element;
      rewardsCount.innerHTML = `${app.rewardIndex + 1}/${app.claims.length} reward`;
    }
  }

  if (!app.reward) {
    hideLoader();
    console.log("No reward found");
    return false;
  }

  verifyCurrentNetwork(app.reward.networkId).catch(console.error);

  if (permitCheck(app.reward)) {
    const treasury = await fetchTreasury(app.reward);

    // insert tx data into table
    const requestedAmountElement = insertErc20PermitTableData(app, table, treasury);

    renderTokenSymbol({
      tokenAddress: app.reward.permit.permitted.token,
      ownerAddress: app.reward.owner,
      amount: app.reward.transferDetails.requestedAmount,
      explorerUrl: networkExplorers[app.reward.networkId],
      table,
      requestedAmountElement,
    }).catch(console.error);

    const toElement = document.getElementById(`rewardRecipient`) as Element;
    renderEnsName({ element: toElement, address: app.reward.transferDetails.to }).catch(console.error);

    generateInvalidatePermitAdminControl(app).catch(console.error);

    if (app.claimTxs[app.reward.permit.nonce.toString()] !== undefined) {
      hideClaimButton();
      showViewClaimButton();
      viewClaimButton.element.addEventListener("click", () => window.open(`${app.currentExplorerUrl}/tx/${app.claimTxs[app.reward.permit.nonce.toString()]}`));
    } else {
      hideViewClaimButton();
      showClaimButton();
      claimButton.element.addEventListener("click", claimErc20PermitHandlerWrapper(app));
    }
    table.setAttribute(`data-claim`, "ok");

    claimButton.element.addEventListener("click", claimErc20PermitHandlerWrapper(app));
  } else {
    const requestedAmountElement = insertErc721PermitTableData(app.reward, table);
    table.setAttribute(`data-claim`, "ok");

    renderNftSymbol({
      tokenAddress: app.reward.permit.permitted.token,
      explorerUrl: networkExplorers[app.reward.networkId],
      table,
      requestedAmountElement,
    }).catch(console.error);

    const toElement = document.getElementById(`rewardRecipient`) as Element;
    renderEnsName({ element: toElement, address: app.reward.transferDetails.to }).catch(console.error);

    claimButton.element.addEventListener("click", claimErc721PermitHandler(app.reward));
  }

  return true;
}

function permitCheck(permit: RewardPermit): permit is Erc20Permit {
  return permit.type === "erc20-permit";
}
