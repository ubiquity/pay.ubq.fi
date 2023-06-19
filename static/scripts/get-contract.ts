import { Contract, ethers } from "ethers";
import { daiAbi } from "./abis";
import { claimChainId } from "./render-transaction";
import { chainRpc } from "./constants";

export const getERC20Contract = async (contractAddress: string): Promise<Contract> => {
  const provider = new ethers.providers.JsonRpcProvider(chainRpc[claimChainId]);
  const contractInstance = new ethers.Contract(contractAddress, daiAbi, provider);
  return contractInstance;
};

// async function getContract(contractAddress,) {
//     const provider = new ethers.providers.JsonRpcProvider("https://rpc-pay.ubq.fi/v1/mainnet");
//     const contractAbi = await getContractAbi(contractAddress);
//     const contract = new ethers.Contract(contractAddress, contractAbi, provider);
//     return contract
// }

// async function getContractAbi(contractAddress) {
//     const apiUrl = `https://api.etherscan.io/api?module=contract&action=getabi&address=${contractAddress}`;
//     const response = await fetch(apiUrl);
//     const json = await response.json();
//     const contractAbi = JSON.parse(json.result);
//     return contractAbi
// }
