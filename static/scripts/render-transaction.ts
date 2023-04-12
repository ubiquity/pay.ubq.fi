import { getERC20Contract } from "./get-contract";

export type TxType = {
  permit: {
    permitted: {
      token: string;
      amount: string;
    };
    nonce: string;
    deadline: string;
  };
  transferDetails: {
    to: string;
    requestedAmount: string;
  };
  owner: string;
  signature: string;
};

export let txData: TxType = {
  permit: {
    permitted: {
      token: "",
      amount: "",
    },
    nonce: "",
    deadline: "",
  },
  transferDetails: {
    to: "",
    requestedAmount: "",
  },
  owner: "",
  signature: "",
};

const setClaimMessage = (type: string, message: string): void => {
  const claimMessageTypeElement = document.querySelector(`table > thead th`) as Element;
  const claimMessageBodyElement = document.querySelector(`table > thead td`) as Element;
  claimMessageTypeElement.textContent = type;
  claimMessageBodyElement.textContent = message;
};

const renderTokenSymbol = async (table: Element, requestedAmountElement: Element): Promise<void> => {
  const contract = await getERC20Contract(txData.permit.permitted.token);
  const symbol = await contract.symbol();
  table.setAttribute(`data-contract-loaded`, "true");
  requestedAmountElement.innerHTML = `<a target="_blank" rel="noopener noreferrer" href="https://etherscan.io/token/${txData.permit.permitted.token}?a=${
    txData.owner
  }">${Number(txData.transferDetails.requestedAmount) / 1e18} ${symbol}</a>`;
};

// const ensRegistryWithFallbackAddress = "0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e"

const insertTableData = async (table: Element): Promise<Element> => {
  const requestedAmountElement = document.getElementById("transferDetails.requestedAmount") as Element;

  // TO
  const toFull = document.querySelector("#To .full") as Element;
  const toShort = document.querySelector("#To .short") as Element;
  toFull.textContent = txData.transferDetails.to;
  toShort.textContent = shortenAddress(txData.transferDetails.to);

  // fetch ens name
  // const ensName = await fetch(`https://api.ens.domains/v1/name/${txData.transferDetails.to}`)
  // await

  const toBoth = document.getElementById(`transferDetails.to`) as Element;
  toBoth.innerHTML = `<a target="_blank" rel="noopener noreferrer" href="https://etherscan.io/address/${txData.transferDetails.to}">${toBoth.innerHTML}</a>`;

  // TOKEN

  const tokenFull = document.querySelector("#Token .full") as Element;
  const tokenShort = document.querySelector("#Token .short") as Element;
  tokenFull.textContent = txData.permit.permitted.token;
  tokenShort.textContent = shortenAddress(txData.permit.permitted.token);

  const tokenBoth = document.getElementById(`permit.permitted.token`) as Element;
  tokenBoth.innerHTML = `<a target="_blank" rel="noopener noreferrer" href="https://etherscan.io/token/${txData.permit.permitted.token}">${tokenBoth.innerHTML}</a>`;

  const ownerElem = document.getElementById("owner") as Element;
  ownerElem.innerHTML = `<a target="_blank" rel="noopener noreferrer" href="https://etherscan.io/address/${txData.owner}">${txData.owner}</a>`;
  const nonceELem = document.getElementById("permit.nonce") as Element;
  nonceELem.textContent = txData.permit.nonce;
  const deadlineElem = document.getElementById("permit.deadline") as Element;
  deadlineElem.textContent = txData.permit.deadline;
  requestedAmountElement.textContent = (Number(txData.transferDetails.requestedAmount) / 1e18).toString();
  const signatureElem = document.getElementById("signature") as Element;
  signatureElem.textContent = txData.signature;

  table.setAttribute(`data-claim-rendered`, "true");
  return requestedAmountElement;
};

async function renderEnsName(element: Element, address: string, tokenView: boolean = false): Promise<void> {
  // const provider = new ethers.providers.Web3Provider(window.ethereum);
  // const ens = await provider.lookupAddress(address);
  const ensResolve = await fetch(`https://ens.cirip.io/${address}`);
  let href: string = "";
  try {
    const resolved = await ensResolve.json();
    let ensName;
    if (resolved.reverseRecord) {
      ensName = resolved.reverseRecord;
    } else if (resolved.domains.length) {
      const domain = resolved.domains.shift();
      if (domain) {
        ensName = domain;
      }
    }
    if (ensName) {
      if (tokenView) {
        href = `https://etherscan.io/token/${txData.permit.permitted.token}?a=${address}`;
      } else {
        href = `https://etherscan.io/address/${address}"`;
      }
      element.innerHTML = `<a target="_blank" rel="noopener noreferrer" href="${href}">${ensName}</a>`;
    }
  } catch (error) {}
}

const shortenAddress = (address: string): string => {
  return `${address.slice(0, 10)}...${address.slice(-8)}`;
};

export const renderTransaction = async (): Promise<void> => {
  const table = document.getElementsByTagName(`table`)[0];

  // decode base64 to get tx data
  const urlParams = new URLSearchParams(window.location.search);
  const base64encodedTxData = urlParams.get("claim");

  if (!base64encodedTxData) {
    setClaimMessage("Notice", `No claim data found.`);
    table.setAttribute(`data-claim`, "none");
    return;
  }

  try {
    txData = JSON.parse(atob(base64encodedTxData));
    (window as any).txData = txData;
  } catch (error) {
    setClaimMessage("Error", `Invalid claim data passed in URL.`);
    table.setAttribute(`data-claim`, "error");
    return;
  }
  // insert tx data into table

  const requestedAmountElement = await insertTableData(table);
  table.setAttribute(`data-claim`, "ok");
  renderTokenSymbol(table, requestedAmountElement).catch(console.error);

  const toElement = document.getElementById(`transferDetails.to`) as Element;
  const fromElement = document.getElementById("owner") as Element;

  renderEnsName(toElement, txData.transferDetails.to).catch(console.error);
  await renderEnsName(fromElement, txData.owner, true).catch(console.error);
};
