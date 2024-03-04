import { JsonRpcProvider } from "@ethersproject/providers";
import { Contract, ethers } from "ethers";
import { erc20Abi } from "../abis";

export async function getErc20Contract(contractAddress: string, provider: JsonRpcProvider): Promise<Contract> {
  return new ethers.Contract(contractAddress, erc20Abi, provider);
}
