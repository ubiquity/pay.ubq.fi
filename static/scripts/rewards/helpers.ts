import { JsonRpcProvider } from "@ethersproject/providers";
import axios from "axios";
import { Contract, ethers } from "ethers";
import { erc20Abi } from "./abis";
import { AppState } from "./app-state";
import { networkRpcs } from "./constants";

type DataType = {
  jsonrpc: string;
  id: number;
  result: {
    number: string;
    timestamp: string;
    hash: string;
  };
};

function verifyBlock(data: DataType) {
  try {
    const { jsonrpc, id, result } = data;
    const { number, timestamp, hash } = result;
    return jsonrpc === "2.0" && id === 1 && parseInt(number, 16) > 0 && parseInt(timestamp, 16) > 0 && hash.match(/[0-9|a-f|A-F|x]/gm)?.join("").length === 66;
  } catch (error) {
    return false;
  }
}

const RPC_BODY = JSON.stringify({
  jsonrpc: "2.0",
  method: "eth_getBlockByNumber",
  params: ["latest", false],
  id: 1,
});

const RPC_HEADER = {
  "Content-Type": "application/json",
};

export async function getErc20Contract(contractAddress: string, provider: JsonRpcProvider): Promise<Contract> {
  return new ethers.Contract(contractAddress, erc20Abi, provider);
}

export async function testRpcPerformance(networkId: number) {
  const latencies: Record<string, number> = JSON.parse(localStorage.getItem("rpcLatencies") || "{}");

  const promises = networkRpcs[networkId].map(async (baseURL: string) => {
    try {
      const startTime = performance.now();
      const API = axios.create({
        baseURL,
        headers: RPC_HEADER,
      });

      const { data } = await API.post("", RPC_BODY);
      const endTime = performance.now();
      const latency = endTime - startTime;
      if (verifyBlock(data)) {
        // Save the latency in localStorage
        latencies[baseURL] = latency;
      } else {
        // Save -1 in localStorage to indicate an error
        latencies[baseURL] = -1;
      }
    } catch (error) {
      // Save -1 in localStorage to indicate an error
      latencies[baseURL] = -1;
    }
  });

  await Promise.all(promises);
  localStorage.setItem("rpcLatencies", JSON.stringify(latencies));
}

export function getFastestRpcProvider(networkId: number) {
  const latencies: Record<string, number> = JSON.parse(localStorage.getItem("rpcLatencies") || "{}");

  // Filter out latencies with a value of less than 0 because -1 means it failed
  // Also filter out latencies that do not belong to the desired network
  const validLatencies = Object.entries(latencies).filter(([key, latency]) => latency >= 0 && key.startsWith(`${networkId}_`));

  // Get all valid latencies from localStorage and find the fastest RPC
  const sortedLatencies = validLatencies.sort((a, b) => a[1] - b[1]);
  const optimalRPC = sortedLatencies[0][0].split("_").slice(1).join("_"); // Remove the network ID from the key

  return new ethers.providers.JsonRpcProvider(optimalRPC, {
    name: optimalRPC,
    chainId: networkId,
  });
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
