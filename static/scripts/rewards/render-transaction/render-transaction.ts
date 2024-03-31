import { app } from "../app-state";
import { networkExplorers } from "../constants";
import { buttonController, getMakeClaimButton, viewClaimButton } from "../toaster";
import { checkRenderInvalidatePermitAdminControl, claimErc20PermitHandlerWrapper, fetchTreasury, handleInvalidateButton } from "../web3/erc20-permit";
import { claimErc721PermitHandler } from "../web3/erc721-permit";
import { verifyCurrentNetwork } from "../web3/verify-current-network";
import { insertErc20PermitTableData, insertErc721PermitTableData } from "./insert-table-data";
import { renderEnsName } from "./render-ens-name";
import { renderNftSymbol, renderTokenSymbol } from "./render-token-symbol";
import { Erc20Permit, RewardPermit } from "./tx-type";

const carousel = document.getElementById("carousel") as Element;
const tablesTarget = document.getElementById("table-target")!;
// const table = document.querySelector(`table`) as HTMLTableElement;
type Success = boolean;

function displayRewardDetails(table: HTMLTableElement) {
  let isDetailsVisible = false;
  table.setAttribute(`data-details-visible`, isDetailsVisible.toString());
  const additionalDetails = table.querySelector(`#additionalDetails`) as HTMLElement;
  additionalDetails.addEventListener("click", () => {
    isDetailsVisible = !isDetailsVisible;
    table.setAttribute(`data-details-visible`, isDetailsVisible.toString());
  });
}

export function renderTransactions() {
  tablesTarget.innerHTML = "";
  return Promise.all(
    app.claims.map((claim) =>
      renderTransaction(claim).then((table) => {
        handleInvalidateButton(table, claim);
        displayRewardDetails(table);
        return table;
      })
    )
  ).then((tables) => tables.map((table) => tablesTarget.appendChild(table)));
}

async function renderTransaction(reward: RewardPermit): Promise<HTMLTableElement> {
  // if (app.claims && app.claims.length > 1) {
  //   carousel.className = "flex";
  //   const rewardsCount = document.getElementById("rewardsCount") as Element;
  //   rewardsCount.innerHTML = `${app.rewardIndex + 1}/${app.claims.length} reward`;
  // }

  // if (!app.reward) {
  //   buttonController.hideAll();
  //   console.log("No reward found");
  //   return false;
  // }
  const table = (document.getElementById("table-template") as HTMLTemplateElement)!.content.cloneNode(true).firstChild as HTMLTableElement;
  verifyCurrentNetwork(reward.networkId).catch(console.error);

  if (permitCheck(reward)) {
    const treasury = await fetchTreasury(reward);

    // insert tx data into table
    const requestedAmountElement = insertErc20PermitTableData(app, reward, table, treasury);

    renderTokenSymbol({
      tokenAddress: reward.permit.permitted.token,
      ownerAddress: reward.owner,
      amount: reward.transferDetails.requestedAmount,
      explorerUrl: networkExplorers[reward.networkId],
      table,
      requestedAmountElement,
    }).catch(console.error);

    const toElement = document.getElementById(`rewardRecipient`) as Element;
    renderEnsName({ element: toElement, address: reward.transferDetails.to }).catch(console.error);

    if (app.provider) {
      checkRenderInvalidatePermitAdminControl(app).catch(console.error);
    }

    if (app.claimTxs[reward.permit.nonce.toString()] !== undefined) {
      buttonController.showViewClaim();
      viewClaimButton.addEventListener("click", () => window.open(`${app.currentExplorerUrl}/tx/${app.claimTxs[reward.permit.nonce.toString()]}`));
    } else if (window.ethereum) {
      // requires wallet connection to claim
      buttonController.showMakeClaim();
      // getMakeClaimButton(table).addEventListener("click", claimErc20PermitHandlerWrapper(app, reward));
    }

    table.setAttribute(`data-make-claim`, "ok");
  } else {
    const requestedAmountElement = insertErc721PermitTableData(reward, table);
    table.setAttribute(`data-make-claim`, "ok");
    renderNftSymbol({
      tokenAddress: reward.permit.permitted.token,
      explorerUrl: networkExplorers[reward.networkId],
      table,
      requestedAmountElement,
    }).catch(console.error);

    const toElement = document.getElementById(`rewardRecipient`) as Element;
    renderEnsName({ element: toElement, address: reward.transferDetails.to }).catch(console.error);

    // getMakeClaimButton(table).addEventListener("click", claimErc721PermitHandler(reward));
  }

  return table;
}

function permitCheck(permit: RewardPermit): permit is Erc20Permit {
  return permit.type === "erc20-permit";
}
