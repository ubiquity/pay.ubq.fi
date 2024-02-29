import { ethers } from "ethers";

export function getFastestRpcProvider(networkId: number) {
  const latencies: Record<string, number> = JSON.parse(localStorage.getItem("rpcLatencies") || "{}");

  // filter out latencies that do not belong to the desired network
  const validLatencies = Object.entries(latencies)
    .filter(([rpc]) => rpc.endsWith(`_${networkId}`))
    .map(([rpc, latency]) => [rpc.split("_")[0], latency] as [string, number]);

  // Sort the latencies and get the fastest RPC
  const sortedLatencies = validLatencies.sort((a, b) => a[1] - b[1]);
  const optimalRPC = sortedLatencies[0][0];

  console.log(`Fastest RPC for network ${networkId} is ${optimalRPC}`);
  return new ethers.providers.JsonRpcProvider(optimalRPC, {
    name: optimalRPC,
    chainId: networkId,
  });
}
