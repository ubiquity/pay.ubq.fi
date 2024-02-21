import { JsonRpcProvider } from "@ethersproject/providers";
import { AppState } from "../app-state";
import { getFastestRpcProvider } from "./getFastestRpcProvider";
import { testRpcPerformance } from "./testRpcPerformance";

let optimalProvider: JsonRpcProvider | null = null;
let isTestStarted = false;
let isTestCompleted = false;

export async function getOptimalProvider(app: AppState): Promise<JsonRpcProvider> {
  const networkId = app.transactionNetworkId;
  console.trace({ app });
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

  return (app.provider = optimalProvider);
}
