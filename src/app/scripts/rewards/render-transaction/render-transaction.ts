"use client";

import { AppState, app } from "../app-state";
import { networkExplorers } from "../constants";
import { getButtonController, getMakeClaimButton } from "../toaster";
import { checkRenderInvalidatePermitAdminControl, fetchTreasury } from "../web3/erc20-permit";
import { claimErc721PermitHandler } from "../web3/erc721-permit";
import { verifyCurrentNetwork } from "../web3/verify-current-network";
import { insertErc20PermitTableData, insertErc721PermitTableData } from "./insert-table-data";
import { renderEnsName } from "./render-ens-name";
import { renderNftSymbol, renderTokenSymbol } from "./render-token-symbol";
import { Erc20Permit, RewardPermit } from "./tx-type";

type Success = boolean;

export async function renderTxDetails(app: AppState, table: HTMLTableElement): Promise<void> {
  const treasury = await fetchTreasury(app.reward);
  // insert tx data into table
  const requestedAmountElement = insertErc20PermitTableData(app, table, treasury);

  renderTokenSymbol({
    tokenAddress: app.reward.tokenAddress,
    ownerAddress: app.reward.owner,
    amount: app.reward.amount,
    explorerUrl: networkExplorers[app.reward.networkId],
    table,
    requestedAmountElement,
  }).catch(console.error);

  const toElement = document.getElementById(`rewardRecipient`) as Element;
  renderEnsName({ element: toElement, address: app.reward.beneficiary }).catch(console.error);
}

export function viewClaimHandler(app: AppState) {
  window.open(`${app.currentExplorerUrl}/tx/${app.claimTxs[app.reward.nonce.toString()]}`);
}

export async function renderTransaction(): Promise<Success> {
  const carousel = document.getElementById("carousel") as Element;
  const table = document.querySelector(`table`) as HTMLTableElement;

  if (app.claims && app.claims.length > 1) {
    carousel.className = "flex";
    const rewardsCount = document.getElementById("rewardsCount") as Element;
    rewardsCount.innerHTML = `${app.rewardIndex + 1}/${app.claims.length} reward`;
  }

  if (!app.reward) {
    getButtonController().hideAll();
    console.log("No reward found");
    return false;
  }

  verifyCurrentNetwork(app).catch(console.error);

  if (permitCheck(app.reward)) {
    if (app.provider) {
      checkRenderInvalidatePermitAdminControl(app).catch(console.error);
    }

    if (app.claimTxs[app.reward.nonce.toString()] !== undefined) {
      getButtonController().showViewClaim();
      const viewClaimButton = document.getElementById("view-claim") as HTMLButtonElement;

      viewClaimButton.addEventListener("click");
    } else if (window.ethereum) {
      // requires wallet connection to claim
      getButtonController().showMakeClaim();
    }

    table.setAttribute(`data-make-claim`, "ok");
  } else {
    const requestedAmountElement = insertErc721PermitTableData(app.reward, table);
    table.setAttribute(`data-make-claim`, "ok");
    renderNftSymbol({
      tokenAddress: app.reward.permit.permitted.token,
      explorerUrl: networkExplorers[app.reward.networkId],
      table,
      requestedAmountElement,
    }).catch(console.error);

    const toElement = document.getElementById(`rewardRecipient`) as Element;
    renderEnsName({ element: toElement, address: app.reward.transferDetails.to }).catch(console.error);

    getMakeClaimButton().addEventListener("click", claimErc721PermitHandler(app.reward));
  }

  return true;
}

function permitCheck(permit: RewardPermit): permit is Erc20Permit {
  return permit.type === "erc20-permit";
}
