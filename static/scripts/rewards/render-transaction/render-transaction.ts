import { ERC20Permit, Permit, TokenType } from "@ubiquibot/permit-generation/types";
import { app } from "../app-state";
import { buttonController, getMakeClaimButton, viewClaimButton } from "../button-controller";
import { claimErc20PermitHandlerWrapper, fetchTreasury } from "../web3/erc20-permit";
import { claimErc721PermitHandler } from "../web3/erc721-permit";
import { insertErc20PermitTableData, insertErc721PermitTableData } from "./insert-table-data";
import { renderEnsName } from "./render-ens-name";
import { renderNftSymbol, renderTokenSymbol } from "./render-token-symbol";

const carousel = document.getElementById("carousel") as Element;
const table = document.querySelector(`table`) as HTMLTableElement;
type Success = boolean;

export async function renderTransaction(): Promise<Success> {
  if (app.claims && app.claims.length > 1) {
    carousel.className = "ready";
    const rewardsCount = document.getElementById("rewardsCount") as Element;
    rewardsCount.innerHTML = `${app.rewardIndex + 1}/${app.claims.length} reward`;
  }

  if (!app.reward) {
    buttonController.hideAll();
    console.log("No reward found");
    return false;
  }

  if (isErc20Permit(app.reward)) {
    const treasury = await fetchTreasury(app.reward);
    table.setAttribute(`data-additional-data-size`, "small");

    // insert tx data into table
    const requestedAmountElement = insertErc20PermitTableData(app, table, treasury);

    renderTokenSymbol({
      tokenAddress: app.reward.tokenAddress,
      ownerAddress: app.reward.owner,
      amount: app.reward.amount,
      explorerUrl: app.currentExplorerUrl,
      table,
      requestedAmountElement,
    }).catch(console.error);

    const toElement = document.getElementById(`rewardRecipient`) as Element;
    renderEnsName({ element: toElement, address: app.reward.beneficiary }).catch(console.error);

    if (app.claimTxs[app.reward.nonce.toString()] !== undefined) {
      buttonController.showViewClaim();
      viewClaimButton.addEventListener("click", () => window.open(`${app.currentExplorerUrl}/tx/${app.claimTxs[app.reward.nonce.toString()]}`));
    } else if (window.ethereum) {
      getMakeClaimButton().addEventListener("click", claimErc20PermitHandlerWrapper(app));
    }

    table.setAttribute(`data-make-claim`, "ok");
  } else {
    const requestedAmountElement = insertErc721PermitTableData(app.reward, table);
    table.setAttribute(`data-make-claim`, "ok");
    table.setAttribute(`data-additional-data-size`, "large");
    renderNftSymbol({
      tokenAddress: app.reward.tokenAddress,
      explorerUrl: app.currentExplorerUrl,
      table,
      requestedAmountElement,
    }).catch(console.error);

    const toElement = document.getElementById(`rewardRecipient`) as Element;
    renderEnsName({ element: toElement, address: app.reward.beneficiary }).catch(console.error);

    getMakeClaimButton().addEventListener("click", claimErc721PermitHandler(app.reward));
  }

  return true;
}

export function isErc20Permit(permit: Permit): permit is ERC20Permit {
  return permit.tokenType === TokenType.ERC20;
}
