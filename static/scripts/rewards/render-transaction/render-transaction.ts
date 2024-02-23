import { app } from "../app-state";
import { networkExplorers } from "../constants";
import { claimButton, hideLoader } from "../toaster";
import { claimErc20PermitHandlerWrapper, fetchFundingWallet, generateInvalidatePermitAdminControl } from "../web3/erc20-permit";
import { claimErc721PermitHandler } from "../web3/erc721-permit";
import { verifyCurrentNetwork } from "../web3/verify-current-network";
import { insertErc20PermitTableData, insertErc721PermitTableData } from "./insert-table-data";
import { renderEnsName } from "./render-ens-name";
import { renderNftSymbol, renderTokenSymbol } from "./render-token-symbol";
import { setPagination } from "./set-pagination";

type Success = boolean;

export async function renderTransaction(nextTx?: boolean): Promise<Success> {
  const table = document.getElementsByTagName(`table`)[0];

  if (nextTx) {
    app.nextPermit();
    if (!app.claims || app.claims.length <= 1) {
      // already hidden
    } else {
      setPagination(document.getElementById("nextTx"), document.getElementById("previousTx"));

      const rewardsCount = document.getElementById("rewardsCount") as Element;
      rewardsCount.innerHTML = `${app.permitIndex + 1}/${app.claims.length} reward`;
      table.setAttribute(`data-claim`, "error");
    }
  }

  if (!app.permit) {
    hideLoader();
    return false;
  }

  verifyCurrentNetwork(app.permit.networkId).catch(console.error);

  if (app.permit.type === "erc20-permit") {
    const treasury = await fetchFundingWallet(app);

    // insert tx data into table
    const requestedAmountElement = insertErc20PermitTableData(app, table, treasury);

    renderTokenSymbol({
      tokenAddress: app.permit.permit.permitted.token,
      ownerAddress: app.permit.owner,
      amount: app.permit.transferDetails.requestedAmount,
      explorerUrl: networkExplorers[app.permit.networkId],
      table,
      requestedAmountElement,
      provider: app.provider,
    }).catch(console.error);

    const toElement = document.getElementById(`rewardRecipient`) as Element;
    renderEnsName({ element: toElement, address: app.permit.transferDetails.to }).catch(console.error);

    generateInvalidatePermitAdminControl(app).catch(console.error);

    claimButton.element.addEventListener("click", claimErc20PermitHandlerWrapper(app));
    table.setAttribute(`data-claim`, "ok");
  } else if (app.permit.type === "erc721-permit") {
    const requestedAmountElement = insertErc721PermitTableData(app.permit, table);
    table.setAttribute(`data-claim`, "ok");

    renderNftSymbol({
      tokenAddress: app.permit.permit.permitted.token,
      explorerUrl: networkExplorers[app.permit.networkId],
      table,
      requestedAmountElement,
      provider: app.provider,
    }).catch(console.error);

    const toElement = document.getElementById(`rewardRecipient`) as Element;
    renderEnsName({ element: toElement, address: app.permit.transferDetails.to }).catch(console.error);

    claimButton.element.addEventListener("click", claimErc721PermitHandler(app.permit));
  }

  return true;
}
