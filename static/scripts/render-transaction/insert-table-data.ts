import { appState } from ".";
import { shortenAddress } from "./index";

export async function insertTableData(table: Element): Promise<Element> {
  const requestedAmountElement = document.getElementById("transferDetails.requestedAmount") as Element;
  renderToFields();
  renderTokenFields();
  renderDetailsFields(requestedAmountElement);
  table.setAttribute(`data-claim-rendered`, "true");
  return requestedAmountElement;
}

function renderDetailsFields(requestedAmountElement: Element) {
  const ownerElem = document.getElementById("owner") as Element;
  ownerElem.innerHTML = `<a target="_blank" rel="noopener noreferrer" href="${appState.explorerUrl}/address/${appState.txData.owner}">${appState.txData.owner}</a>`;
  const nonceELem = document.getElementById("permit.nonce") as Element;
  nonceELem.innerHTML = `<div>${appState.txData.permit.nonce}</div>`;
  const deadlineElem = document.getElementById("permit.deadline") as Element;
  deadlineElem.innerHTML = `<div>${appState.txData.permit.deadline}</div>`;
  requestedAmountElement.innerHTML = `<div>${(Number(appState.txData.transferDetails.requestedAmount) / 1000000000000000000).toString()}</div>`;
  const signatureElem = document.getElementById("signature") as Element;
  signatureElem.innerHTML = `<div>${appState.txData.signature}</div>`;
}

function renderTokenFields() {
  const tokenFull = document.querySelector("#Token .full") as Element;
  const tokenShort = document.querySelector("#Token .short") as Element;
  tokenFull.innerHTML = `<div>${appState.txData.permit.permitted.token}</div>`;
  tokenShort.innerHTML = `<div>${shortenAddress(appState.txData.permit.permitted.token)}</div>`;

  const tokenBoth = document.getElementById(`permit.permitted.token`) as Element;
  tokenBoth.innerHTML = `<a target="_blank" rel="noopener noreferrer" href="${appState.explorerUrl}/token/${appState.txData.permit.permitted.token}">${tokenBoth.innerHTML}</a>`;
}

function renderToFields() {
  const toFull = document.querySelector("#To .full") as Element;
  const toShort = document.querySelector("#To .short") as Element;
  toFull.innerHTML = `<div>${appState.txData.transferDetails.to}</div>`;
  toShort.innerHTML = `<div>${shortenAddress(appState.txData.transferDetails.to)}</div>`;

  const toBoth = document.getElementById(`transferDetails.to`) as Element;
  toBoth.innerHTML = `<a target="_blank" rel="noopener noreferrer" href="${appState.explorerUrl}/address/${appState.txData.transferDetails.to}">${toBoth.innerHTML}</a>`;
}
