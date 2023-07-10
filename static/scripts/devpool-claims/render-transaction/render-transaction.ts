import { app } from "./index";
import { insertTableData } from "./insert-table-data";
import { renderEnsName } from "./render-ens-name";
import { renderTokenSymbol } from "./render-token-symbol";
import { setClaimMessage } from "./set-claim-message";
import { networkExplorer, Network } from "../constants";

export async function renderTransaction(): Promise<void> {
  const table = document.getElementsByTagName(`table`)[0];

  // decode base64 to get tx data
  const urlParams = new URLSearchParams(window.location.search);
  const base64encodedTxData = urlParams.get("claim");
  const _network = urlParams.get("network") || app.claimNetworkId;

  if (!_network) {
    setClaimMessage({ type: "Error", message: `No network ID passed in URL.` });
    table.setAttribute(`data-claim`, "error");
    return;
  }

  // if network id is not prefixed with 0x, convert it to hex
  if (!_network.startsWith("0x")) {
    app.claimNetworkId = `0x${Number(_network).toString(16)}` as Network;
  }

  const network = app.claimNetworkId as keyof typeof networkExplorer;

  app.explorerUrl = networkExplorer[network] || app.explorerUrl;

  if (!base64encodedTxData) {
    setClaimMessage({ type: "Notice", message: `No claim data found.` });
    table.setAttribute(`data-claim`, "none");
    return;
  }

  try {
    app.txData = JSON.parse(atob(base64encodedTxData));
  } catch (error) {
    setClaimMessage({ type: "Error", message: `Invalid claim data passed in URL.` });
    table.setAttribute(`data-claim`, "error");
    return;
  }
  // insert tx data into table
  const requestedAmountElement = await insertTableData(table);
  table.setAttribute(`data-claim`, "ok");
  renderTokenSymbol({ table, requestedAmountElement }).catch(console.error);

  const toElement = document.getElementById(`transferDetails.to`) as Element;
  const fromElement = document.getElementById("owner") as Element;

  renderEnsName({ element: toElement, address: app.txData.transferDetails.to }).catch(console.error);
  await renderEnsName({ element: fromElement, address: app.txData.owner, tokenView: true }).catch(console.error);
}
