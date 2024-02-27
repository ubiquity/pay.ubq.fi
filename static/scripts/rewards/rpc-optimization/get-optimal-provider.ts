import { JsonRpcProvider } from "@ethersproject/providers";
import { AppState } from "../app-state";
import { getFastestRpcProvider } from "./get-fastest-rpc-provider";
import { testRpcPerformance } from "./test-rpc-performance";

let isTestStarted = false;
let isTestCompleted = false;

export async function useFastestRpc(app: AppState): Promise<JsonRpcProvider> {
  const networkId = app.reward.networkId || app.networkId || app.claims[0].networkId;
  if (!networkId) throw new Error("Network ID not found");

  if (networkId === 31337)
    return new JsonRpcProvider("http://127.0.0.1:8545", {
      name: "http://127.0.0.1:8545",
      chainId: 31337,
    });

  if (!isTestCompleted && !isTestStarted) {
    isTestStarted = true;
    await testRpcPerformance(networkId).catch(console.error);
    isTestCompleted = true;
  }

  return getFastestRpcProvider(networkId);
}
