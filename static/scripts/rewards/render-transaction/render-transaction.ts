import { app } from "../app-state";
import { networkExplorers } from "../constants";
import { claimButton, hideClaimButton, resetClaimButton } from "../toaster";
import { claimErc20PermitHandlerWrapper, fetchTreasury, generateInvalidatePermitAdminControl } from "../web3/erc20-permit";
import { claimErc721PermitHandler } from "../web3/erc721-permit";
import { verifyCurrentNetwork } from "../web3/verify-current-network";
import { insertErc20PermitTableData, insertErc721PermitTableData } from "./insert-table-data";
import { renderEnsName } from "./render-ens-name";
import { renderNftSymbol, renderTokenSymbol } from "./render-token-symbol";
import { setPagination } from "./set-pagination";

type Success = boolean;

export async function renderTransaction(nextTx?: boolean): Promise<Success> {
  const table = document.getElementsByTagName(`table`)[0];
  resetClaimButton();

  if (nextTx) {
    app.nextTx();
    if (!app.claims || app.claims.length <= 1) {
      // already hidden
    } else {
      setPagination(document.getElementById("nextTx"), document.getElementById("previousTx"));

      const rewardsCount = document.getElementById("rewardsCount") as Element;
      rewardsCount.innerHTML = `${app.transactionIndex + 1}/${app.claims.length} reward`;
      table.setAttribute(`data-claim`, "none");
    }
  }

  if (!app.transaction) {
    hideClaimButton();
    return false;
  }

  verifyCurrentNetwork(app.transaction.networkId).catch(console.error);

  if (app.transaction.type === "erc20-permit") {
    const treasury = await fetchTreasury(app.transaction, app.provider);

    // insert tx data into table
    const requestedAmountElement = insertErc20PermitTableData(app.transaction, table, treasury);
    table.setAttribute(`data-claim`, "ok");

    renderTokenSymbol({
      tokenAddress: app.transaction.permit.permitted.token,
      ownerAddress: app.transaction.owner,
      amount: app.transaction.transferDetails.requestedAmount,
      explorerUrl: networkExplorers[app.transaction.networkId],
      table,
      requestedAmountElement,
      provider: app.provider,
    }).catch(console.error);

    const toElement = document.getElementById(`rewardRecipient`) as Element;
    renderEnsName({ element: toElement, address: app.transaction.transferDetails.to }).catch(console.error);

    generateInvalidatePermitAdminControl(app.transaction).catch(console.error);

    claimButton.element.addEventListener("click", claimErc20PermitHandlerWrapper(app.transaction));
  } else if (app.transaction.type === "erc721-permit") {
    const requestedAmountElement = insertErc721PermitTableData(app.transaction, table);
    table.setAttribute(`data-claim`, "ok");

    renderNftSymbol({
      tokenAddress: app.transaction.nftAddress,
      explorerUrl: networkExplorers[app.transaction.networkId],
      table,
      requestedAmountElement,
      provider: app.provider,
    }).catch(console.error);

    const toElement = document.getElementById(`rewardRecipient`) as Element;
    renderEnsName({ element: toElement, address: app.transaction.request.beneficiary }).catch(console.error);

    claimButton.element.addEventListener("click", claimErc721PermitHandler(app.transaction));
  }

  return true;
}
