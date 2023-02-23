(async function () {

    // decode base64 to get tx data
    const urlParams = new URLSearchParams(window.location.search);
    const base64encodedTxData = urlParams.get("claim");

    if (!base64encodedTxData) {
        alert(`No claim data passed in URL.\n\nhttps://pay.ubq.fi?claim=...`);
        return;
    }
    let txData;

    try {
        txData = JSON.parse(atob(base64encodedTxData));
    } catch (error) {
        alert(`Invalid claim data passed in URL.`);
        return;
    }
    // insert tx data into table
    document.getElementById("permit.permitted.token").innerHTML = txData.permit.permitted.token;
    document.getElementById("permit.permitted.amount").innerHTML = txData.permit.permitted.amount / 1e18;
    document.getElementById("permit.nonce").innerHTML = txData.permit.nonce;
    document.getElementById("permit.deadline").innerHTML = txData.permit.deadline;
    document.getElementById("transferDetails.to").innerHTML = txData.transferDetails.to;
    document.getElementById("transferDetails.requestedAmount").innerHTML = txData.transferDetails.requestedAmount / 1e18;
    document.getElementById("owner").innerHTML = txData.owner;
    document.getElementById("signature").innerHTML = txData.signature;


    document.getElementById("claimButton").addEventListener("click", () => connectWallet(txData).then(withdraw).catch(console.error));

})();
