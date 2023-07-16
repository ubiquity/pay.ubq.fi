import { app } from "./index";
import { insertTableData } from "./insert-table-data";
import { renderEnsName } from "./render-ens-name";
import { renderTokenSymbol } from "./render-token-symbol";
import { setClaimMessage } from "./set-claim-message";
import { networkExplorers, NetworkIds } from "../constants";
import { toaster } from "../toaster";

type Success = boolean;
export async function renderTransaction(): Promise<Success> {
  const table = document.getElementsByTagName(`table`)[0];

  // decode base64 to get tx data
  const urlParams = new URLSearchParams(window.location.search);
  const base64encodedTxData = urlParams.get("claim");
  let _network = urlParams.get("network");

  if (!base64encodedTxData) {
    setClaimMessage({ type: "Notice", message: `No claim data found.` });
    table.setAttribute(`data-claim`, "none");
    return false;
  }

  if (!_network) {
    // setClaimMessage({ type: "Error", message: `No network ID passed in URL.` });
    // table.setAttribute(`data-claim`, "error");
    // return false;
    toaster.create("warning", `You must pass in an EVM network ID in the URL query parameters using the key 'network' e.g. '?network=1'`);
    setTimeout(() => toaster.create("info", `Defaulted to Ethereum mainnet.`), 5500);
    _network = app.claimNetworkId = "0x1" as NetworkIds;
  }

  // if network id is not prefixed with 0x, convert it to hex
  if (!_network.startsWith("0x")) {
    app.claimNetworkId = `0x${Number(_network).toString(16)}` as NetworkIds;
  }

  const network = app.claimNetworkId as keyof typeof networkExplorers;

  app.explorerUrl = networkExplorers[network] || app.explorerUrl;

  try {
    app.txData = JSON.parse(atob(base64encodedTxData));
  } catch (error) {
    setClaimMessage({ type: "Error", message: `Invalid claim data passed in URL.` });
    table.setAttribute(`data-claim`, "error");
    return false;
  }
  // insert tx data into table
  const requestedAmountElement = await insertTableData(table);
  table.setAttribute(`data-claim`, "ok");
  renderTokenSymbol({ table, requestedAmountElement }).catch(console.error);

  const toElement = document.getElementById(`transferDetails.to`) as Element;
  const fromElement = document.getElementById("owner") as Element;

  renderEnsName({ element: toElement, address: app.txData.transferDetails.to }).catch(console.error);
  renderEnsName({ element: fromElement, address: app.txData.owner, tokenView: true }).catch(console.error);

  return true;
}
