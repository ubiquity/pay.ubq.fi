import { ethers } from "ethers";

const MAX_RETRIES = 10;

export async function getFastestRpcProvider(networkId: number) {
  const latencies: Record<string, number> = JSON.parse(localStorage.getItem("rpcLatencies") || "{}");

  for (let i = 0; i < MAX_RETRIES; ++i) {
    // Filter out latencies with a value of less than 0 because -1 means it failed
    // Also filter out latencies that do not belong to the desired network
    const validLatencies = Object.entries(latencies).filter(([key, latency]) => latency >= 0 && key.endsWith(`_${networkId}`));

    // Get all valid latencies from localStorage and find the fastest RPC
    const sortedLatencies = validLatencies.sort((a, b) => a[1] - b[1]);
    const optimalRpc = sortedLatencies[0][0];
    const optimalRpcName = optimalRpc.split("_").slice(0, -1).join("_"); // Remove the network ID from the key

    try {
      const rpcProvider = new ethers.JsonRpcProvider(optimalRpcName, {
        name: optimalRpcName,
        chainId: networkId,
      });
      // We check if the networks positively gives us a block when requested to ensure the network works
      // because some of them appear to be constantly failing such as https://gnosis.api.onfinality.io/public
      await rpcProvider.getBlock(1);
      return rpcProvider;
    } catch (e) {
      console.warn(`Failed to get a block using network ${optimalRpc}, will try with another.`);
      delete latencies[optimalRpc];
    }
  }

  return null;
}
