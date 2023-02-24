(async function () {
  // decode base64 to get tx data
  const urlParams = new URLSearchParams(window.location.search);
  const base64encodedTxData = urlParams.get("claim");

  if (!base64encodedTxData) {
    alert(`No claim data passed in URL.\n\nhttps://pay.ubq.fi?claim=...`);
    return;
  }
  window.txData;

  try {
    txData = JSON.parse(atob(base64encodedTxData));
  } catch (error) {
    alert(`Invalid claim data passed in URL.`);
    return;
  }
  // insert tx data into table
  const table = document.getElementsByTagName(`table`)[0];

  const requestedAmountElement = document.getElementById("transferDetails.requestedAmount");

  document.getElementById("permit.permitted.token").textContent = txData.permit.permitted.token;
  document.getElementById("permit.permitted.amount").textContent = txData.permit.permitted.amount / 1e18;
  document.getElementById("permit.nonce").textContent = txData.permit.nonce;
  document.getElementById("permit.deadline").textContent = txData.permit.deadline;
  document.getElementById("transferDetails.to").textContent = txData.transferDetails.to;
  requestedAmountElement.textContent = txData.transferDetails.requestedAmount / 1e18;
  document.getElementById("owner").textContent = txData.owner;
  document.getElementById("signature").textContent = txData.signature;

  table.setAttribute(`data-details-rendered`, "true");



  // read token symbol
  const contract = await window.getContract(txData.permit.permitted.token)
  // const name = await contract.name();
  const symbol = await contract.symbol();
  // console.trace(symbol);
  table.setAttribute(`data-contract-loaded`, "true");
  requestedAmountElement.innerHTML = `<a target="_blank" rel="noopener noreferrer" href="https://etherscan.io/address/${txData.permit.permitted.token}">${txData.transferDetails.requestedAmount / 1e18} ${symbol}</a>`;
  // document.getElementById("Token").style.display = "none";
})();
