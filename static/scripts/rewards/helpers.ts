import { JsonRpcProvider } from "@ethersproject/providers";
import { Contract, ethers } from "ethers";
import { erc20Abi } from "./abis";
import { AppState } from "./app-state";
import { getFastestRpcProvider } from "./rpc-optimization/get-fastest-rpc-provider";
import { testRpcPerformance } from "./rpc-optimization/test-rpc-performance";

export async function getErc20Contract(contractAddress: string, provider: JsonRpcProvider): Promise<Contract> {
  return new ethers.Contract(contractAddress, erc20Abi, provider);
}

let optimalProvider: ethers.providers.JsonRpcProvider | null = null;

let isTestStarted = false;
let isTestCompleted = false;

export async function getOptimalProvider(app: AppState): Promise<JsonRpcProvider> {
  const networkId = app.transactionNetworkId;
  if (!networkId) throw new Error("Network ID not found");

  if (!isTestCompleted && !isTestStarted) {
    isTestStarted = true;
    await testRpcPerformance(networkId);
    isTestCompleted = true;
  }

  if (!optimalProvider) {
    optimalProvider = getFastestRpcProvider(networkId);
  }
  console.trace({ optimalProvider });
  return optimalProvider;
}
