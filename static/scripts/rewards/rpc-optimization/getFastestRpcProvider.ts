import { ethers } from "ethers";

export function getFastestRpcProvider(networkId: number) {
  const latencies: Record<string, number> = JSON.parse(localStorage.getItem("rpcLatencies") || "{}");

  // Filter out latencies with a value of less than 0 because -1 means it failed
  // Also filter out latencies that do not belong to the desired network
  const validLatencies = Object.entries(latencies).filter(([key, latency]) => latency >= 0 && key.startsWith(`${networkId}_`));

  // Get all valid latencies from localStorage and find the fastest RPC
  const sortedLatencies = validLatencies.sort((a, b) => a[1] - b[1]);
  const optimalRPC = sortedLatencies[0][0].split("_")[0]; // Remove the network ID from the key

  return new ethers.providers.JsonRpcProvider(optimalRPC, {
    name: optimalRPC,
    chainId: networkId,
  });
}
