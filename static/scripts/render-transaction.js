(async function () {
  const table = document.getElementsByTagName(`table`)[0];


  // decode base64 to get tx data
  const urlParams = new URLSearchParams(window.location.search);
  const base64encodedTxData = urlParams.get("claim");

  if (!base64encodedTxData) {
    setClaimMessage("Warning", `No claim data passed in URL: https://pay.ubq.fi?claim=...`)
    table.setAttribute(`data-claim`, "none");
    return;
  }
  window.txData;

  try {
    txData = JSON.parse(atob(base64encodedTxData));
  } catch (error) {
    setClaimMessage("Error", `Invalid claim data passed in URL!`)
    table.setAttribute(`data-claim`, "error");
    return;
  }
  // insert tx data into table


  const requestedAmountElement = await insertTableData(table);
  table.setAttribute(`data-claim`, "ok");
  renderTokenSymbol(table, requestedAmountElement).catch(console.error);

  const toElement = document.getElementById(`transferDetails.to`);
  const fromElement = document.getElementById("owner")

  renderEnsName(toElement, txData.transferDetails.to).catch(console.error);
  await renderEnsName(fromElement, txData.owner, true).catch(console.error);
})();

function setClaimMessage(type, message) {
  const claimMessageTypeElement = document.querySelector(`table > thead th`);
  const claimMessageBodyElement = document.querySelector(`table > thead td`);
  claimMessageTypeElement.textContent = type;
  claimMessageBodyElement.textContent = message;
}

// const ensRegistryWithFallbackAddress = "0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e"

async function insertTableData(table) {
  const requestedAmountElement = document.getElementById("transferDetails.requestedAmount");

  // TO
  const toFull = document.querySelector("#To .full");
  const toShort = document.querySelector("#To .short");
  toFull.textContent = txData.transferDetails.to;
  toShort.textContent = shortenAddress(txData.transferDetails.to);

  // fetch ens name
  // const ensName = await fetch(`https://api.ens.domains/v1/name/${txData.transferDetails.to}`)
  // await


  const toBoth = document.getElementById(`transferDetails.to`);
  toBoth.innerHTML = `<a target="_blank" rel="noopener noreferrer" href="https://etherscan.io/address/${txData.transferDetails.to}">${toBoth.innerHTML}</a>`;

  // TOKEN

  const tokenFull = document.querySelector("#Token .full");
  const tokenShort = document.querySelector("#Token .short");
  tokenFull.textContent = txData.permit.permitted.token;
  tokenShort.textContent = shortenAddress(txData.permit.permitted.token);

  const tokenBoth = document.getElementById(`permit.permitted.token`);
  tokenBoth.innerHTML = `<a target="_blank" rel="noopener noreferrer" href="https://etherscan.io/token/${txData.permit.permitted.token}">${tokenBoth.innerHTML}</a>`;



  document.getElementById("permit.permitted.amount").textContent = txData.permit.permitted.amount / 1e18;

  document.getElementById("owner").innerHTML = `<a target="_blank" rel="noopener noreferrer" href="https://etherscan.io/address/${txData.owner}">${txData.owner}</a>`;

  document.getElementById("permit.nonce").textContent = txData.permit.nonce;
  document.getElementById("permit.deadline").textContent = txData.permit.deadline;
  requestedAmountElement.textContent = txData.transferDetails.requestedAmount / 1e18;
  document.getElementById("signature").textContent = txData.signature;

  table.setAttribute(`data-claim-rendered`, "true");
  return requestedAmountElement;
}

async function renderEnsName(element, address, tokenView) {
  // const provider = new ethers.providers.Web3Provider(window.ethereum);
  // const ens = await provider.lookupAddress(address);
  const ensResolve = await fetch(`https://ens.cirip.io/${address}`);
  try {
    const resolved = await ensResolve.json();
    let ensName;
    if (resolved.reverseRecord) {
      ensName = resolved.reverseRecord;
    } else if (resolved.domains.length) {
      const domain = resolved.domains.shift()
      if (domain) {
        ensName = domain
      }
    }
    if (ensName) {
      if (tokenView) {
        href = `https://etherscan.io/token/${txData.permit.permitted.token}?a=${address}`
      }
      else {
        href = `https://etherscan.io/address/${address}"`
      }
      element.innerHTML = `<a target="_blank" rel="noopener noreferrer" href="${href}">${ensName}</a>`;
    }
  } catch (error) { }
}

async function renderTokenSymbol(table, requestedAmountElement) {
  const contract = await window.getERC20Contract(txData.permit.permitted.token);
  const symbol = await contract.symbol();
  table.setAttribute(`data-contract-loaded`, "true");
  requestedAmountElement.innerHTML = `<a target="_blank" rel="noopener noreferrer" href="https://etherscan.io/token/${txData.permit.permitted.token}?a=${txData.owner}">${txData.transferDetails.requestedAmount / 1e18} ${symbol}</a>`;
}

function shortenAddress(address) {
  return `${address.slice(0, 10)}...${address.slice(-8)}`;
}