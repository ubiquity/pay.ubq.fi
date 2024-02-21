import { JsonRpcProvider } from "@ethersproject/providers";
import { AppState } from "../app-state";
import { getFastestRpcProvider } from "./getFastestRpcProvider";
import { testRpcPerformance } from "./testRpcPerformance";

let optimalProvider: JsonRpcProvider | null = null;
let isTestStarted = false;
let isTestCompleted = false;

export async function getOptimalProvider(app: AppState): Promise<JsonRpcProvider> {
  const networkId = app.transactionNetworkId;
  if (!networkId) throw new Error("Network ID not found");

  if (!isTestCompleted && !isTestStarted) {
    isTestStarted = true;
    testRpcPerformance(networkId)
      .then(() => (isTestCompleted = true))
      .catch(console.error);
  }

  if (!optimalProvider) {
    optimalProvider = getFastestRpcProvider(networkId);
  }

  app.provider = optimalProvider;
  return optimalProvider;
}
