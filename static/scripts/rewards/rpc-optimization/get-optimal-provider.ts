import { JsonRpcProvider } from "@ethersproject/providers";
import { AppState } from "../app-state";
import { getFastestRpcProvider } from "./get-fastest-rpc-provider";
import { testRpcPerformance } from "./test-rpc-performance";

let isTestStarted = false;
let isTestCompleted = false;

export async function useFastestRpc(app: AppState): Promise<JsonRpcProvider> {
  const networkId = app.permitNetworkId;

  if (!networkId) throw new Error("Network ID not found");

  if (!isTestCompleted && !isTestStarted) {
    isTestStarted = true;
    await testRpcPerformance(networkId).catch(console.error);
    isTestCompleted = true;
  }

  return getFastestRpcProvider(networkId);
}
