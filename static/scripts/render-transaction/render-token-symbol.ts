import { getDaiLikeContract } from "../get-contract";
import { appState } from "./index";

export async function renderTokenSymbol({ table, requestedAmountElement }: { table: Element; requestedAmountElement: Element }): Promise<void> {
  const contract = await getDaiLikeContract(appState.txData.permit.permitted.token);
  const symbol = await contract.symbol();
  table.setAttribute(`data-contract-loaded`, "true");
  requestedAmountElement.innerHTML = `<a target="_blank" rel="noopener noreferrer" href="${appState.explorerUrl}/token/${
    appState.txData.permit.permitted.token
  }?a=${appState.txData.owner}">${Number(appState.txData.transferDetails.requestedAmount) / 1000000000000000000} ${symbol}</a>`;
}
