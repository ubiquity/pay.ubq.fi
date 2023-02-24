async function getContractAbi(contractAddress) {
    const apiUrl = `https://api.etherscan.io/api?module=contract&action=getabi&address=${contractAddress}`;
    const response = await fetch(apiUrl);
    const json = await response.json();
    const contractAbi = JSON.parse(json.result);
    return contractAbi
}
