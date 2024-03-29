import { app } from "../app-state";
import { networkExplorers } from "../constants";
import { buttonController, getMakeClaimButton, viewClaimButton } from "../toaster";
import { checkRenderInvalidatePermitAdminControl, claimErc20PermitHandlerWrapper, fetchTreasury } from "../web3/erc20-permit";
import { claimErc721PermitHandler } from "../web3/erc721-permit";
import { verifyCurrentNetwork } from "../web3/verify-current-network";
import { insertErc20PermitTableData, insertErc721PermitTableData } from "./insert-table-data";
import { renderEnsName } from "./render-ens-name";
import { renderNftSymbol, renderTokenSymbol } from "./render-token-symbol";
import { Erc20Permit, RewardPermit } from "./tx-type";

const carousel = document.getElementById("carousel") as Element;
const table = document.querySelector(`table`) as HTMLTableElement;
type Success = boolean;

export async function renderTransaction(): Promise<Success> {
  if (app.claims && app.claims.length > 1) {
    carousel.className = "flex";
    const rewardsCount = document.getElementById("rewardsCount") as Element;
    rewardsCount.innerHTML = `${app.rewardIndex + 1}/${app.claims.length} reward`;
  }

  if (!app.reward) {
    buttonController.hideAll();
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

    if (app.provider) {
      checkRenderInvalidatePermitAdminControl(app).catch(console.error);
    }

    if (app.claimTxs[app.reward.permit.nonce.toString()] !== undefined) {
      buttonController.showViewClaim();
      viewClaimButton.addEventListener("click", () => window.open(`${app.currentExplorerUrl}/tx/${app.claimTxs[app.reward.permit.nonce.toString()]}`));
    } else if (window.ethereum) {
      // requires wallet connection to claim
      buttonController.showMakeClaim();
      getMakeClaimButton().addEventListener("click", claimErc20PermitHandlerWrapper(app));
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
