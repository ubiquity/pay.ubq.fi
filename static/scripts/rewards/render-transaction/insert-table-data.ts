import { app } from ".";
import { NftMint, Permit } from "./tx-type";

export const shortenAddress = (address: string): string => {
  return `${address.slice(0, 10)}...${address.slice(-8)}`;
};

export function insertTableData(permit: Permit, table: Element): Element {
  const requestedAmountElement = document.getElementById("transferDetails.requestedAmount") as Element;
  renderToFields(permit.transferDetails.to, app.currentExplorerUrl);
  renderTokenFields(permit.permit.permitted.token, app.currentExplorerUrl);
  renderDetailsFields(permit.owner, app.currentExplorerUrl, requestedAmountElement);
  table.setAttribute(`data-claim-rendered`, "true");
  return requestedAmountElement;
}

export function insertNftTableData(permit: NftMint, table: Element): Element {
  const requestedAmountElement = document.getElementById("transferDetails.requestedAmount") as Element;
  renderToFields(permit.request.beneficiary, app.currentExplorerUrl);
  renderTokenFields(permit.nftAddress, app.currentExplorerUrl);
  table.setAttribute(`data-claim-rendered`, "true");
  return requestedAmountElement;
}

function renderDetailsFields(ownerAddress: string, explorerUrl: string, requestedAmountElement: Element) {
  const ownerElem = document.getElementById("owner") as Element;
  ownerElem.innerHTML = `<a target="_blank" rel="noopener noreferrer" href="${explorerUrl}/address/${ownerAddress}">${ownerAddress}</a>`;
  // const nonceELem = document.getElementById("permit.nonce") as Element;
  // nonceELem.innerHTML = `<div>${app.txData.permit.nonce}</div>`;
  // const deadlineElem = document.getElementById("permit.deadline") as Element;
  // deadlineElem.innerHTML = `<div>${app.txData.permit.deadline}</div>`;
  // requestedAmountElement.innerHTML = `<div>${(Number(app.txData.transferDetails.requestedAmount) / 1000000000000000000).toString()}</div>`;
  // const signatureElem = document.getElementById("signature") as Element;
  // signatureElem.innerHTML = `<div>${app.txData.signature}</div>`;
}

function renderTokenFields(tokenAddress: string, explorerUrl: string) {
  const tokenFull = document.querySelector("#Token .full") as Element;
  const tokenShort = document.querySelector("#Token .short") as Element;
  tokenFull.innerHTML = `<div>${tokenAddress}</div>`;
  tokenShort.innerHTML = `<div>${shortenAddress(tokenAddress)}</div>`;

  const tokenBoth = document.getElementById(`permit.permitted.token`) as Element;
  tokenBoth.innerHTML = `<a target="_blank" rel="noopener noreferrer" href="${explorerUrl}/token/${tokenAddress}">${tokenBoth.innerHTML}</a>`;
}

function renderToFields(receiverAddress: string, explorerUrl: string) {
  const toFull = document.querySelector("#To .full") as Element;
  const toShort = document.querySelector("#To .short") as Element;
  toFull.innerHTML = `<div>${receiverAddress}</div>`;
  toShort.innerHTML = `<div>${shortenAddress(receiverAddress)}</div>`;

  const toBoth = document.getElementById(`transferDetails.to`) as Element;
  toBoth.innerHTML = `<a target="_blank" rel="noopener noreferrer" href="${explorerUrl}/address/${receiverAddress}">${toBoth.innerHTML}</a>`;
}
