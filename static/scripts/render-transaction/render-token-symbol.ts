import { getDaiLikeContract } from "../get-contract";
import { app } from "./index";

export async function renderTokenSymbol({ table, requestedAmountElement }: { table: Element; requestedAmountElement: Element }): Promise<void> {
  const contract = await getDaiLikeContract(app.txData.permit.permitted.token);
  const symbol = await contract.symbol();
  table.setAttribute(`data-contract-loaded`, "true");
  requestedAmountElement.innerHTML = `<a target="_blank" rel="noopener noreferrer" href="${app.explorerUrl}/token/${
    app.txData.permit.permitted.token
  }?a=${app.txData.owner}">${Number(app.txData.transferDetails.requestedAmount) / 1000000000000000000} ${symbol}</a>`;
}
