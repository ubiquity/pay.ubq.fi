import { ERC20PermitReward, PermitReward, TokenType } from "@ubiquibot/permit-generation/types";
import { networkExplorers } from "@ubiquity-dao/rpc-handler";
import { app } from "../app-state";
import { buttonControllers, getMakeClaimButton, getViewClaimButton } from "../toaster";
import { checkRenderInvalidatePermitAdminControl, claimErc20PermitHandlerWrapper, fetchTreasury } from "../web3/erc20-permit";
import { claimErc721PermitHandler } from "../web3/erc721-permit";
import { insertErc20PermitTableData, insertErc721PermitTableData } from "./insert-table-data";
import { renderEnsName } from "./render-ens-name";
import { renderNftSymbol, renderTokenSymbol } from "./render-token-symbol";

export async function renderTransaction(claim: PermitReward, table: Element): Promise<boolean> {
  if (!claim) {
    buttonControllers[claim.nonce].hideAll();
    console.log("No reward found");
    return false;
  }

  if (!table) {
    throw new Error("Missing transaction table");
  }

  if (isErc20Permit(claim)) {
    const treasury = await fetchTreasury(claim);
    table.setAttribute(`data-additional-data-size`, "small");

    // insert tx data into table
    const requestedAmountElement = insertErc20PermitTableData(claim, table, treasury);

    await renderTokenSymbol({
      tokenAddress: claim.tokenAddress,
      ownerAddress: claim.owner,
      amount: claim.amount,
      explorerUrl: networkExplorers[claim.networkId],
      table,
      requestedAmountElement,
      claim,
    });

    const toElement = table.querySelector(`.reward-recipient`) as Element;
    renderEnsName(claim, { element: toElement, address: claim.beneficiary, networkId: claim.networkId as number }).catch(console.error);

    if (app.provider) {
      checkRenderInvalidatePermitAdminControl(app).catch(console.error);
    }

    if (app.claimTxs[claim.nonce.toString()] !== undefined) {
      buttonControllers[claim.nonce].showViewClaim();
      const viewClaimButton = getViewClaimButton(table);
      viewClaimButton.addEventListener("click", () => window.open(`${app.getCurrentExplorerUrl(claim)}/tx/${app.claimTxs[claim.nonce.toString()]}`));
    } else if (window.ethereum) {
      // requires wallet connection to claim
      buttonControllers[claim.nonce].showMakeClaim();
      getMakeClaimButton(table).addEventListener("click", claimErc20PermitHandlerWrapper(table, claim));
    }

    table.setAttribute(`data-make-claim`, "ok");
  } else {
    const requestedAmountElement = insertErc721PermitTableData(claim, table);
    table.setAttribute(`data-make-claim`, "ok");
    table.setAttribute(`data-additional-data-size`, "large");
    renderNftSymbol({
      tokenAddress: claim.tokenAddress,
      explorerUrl: networkExplorers[claim.networkId],
      table,
      requestedAmountElement,
      claim,
    }).catch(console.error);

    const toElement = document.getElementById(`reward-recipient`) as Element;
    renderEnsName(claim, { element: toElement, address: claim.beneficiary, networkId: claim.networkId as number }).catch(console.error);

    getMakeClaimButton(table).addEventListener("click", claimErc721PermitHandler(table, claim));
  }

  return true;
}

function isErc20Permit(permit: PermitReward): permit is ERC20PermitReward {
  return permit.tokenType === TokenType.ERC20;
}
