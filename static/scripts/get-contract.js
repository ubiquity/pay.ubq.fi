async function getContract(contractAddress,) {
    const provider = new ethers.providers.Web3Provider(window.ethereum);
    const contractAbi = await window.getContractAbi(contractAddress);
    const contract = new ethers.Contract(contractAddress, contractAbi, provider);
    return contract
}