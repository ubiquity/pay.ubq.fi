import { JsonRpcProvider } from "@ethersproject/providers";
import axios from "axios";
import { Contract, ethers } from "ethers";
import { erc20Abi } from "./abis";
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

  // Get all latencies from localStorage and find the fastest RPC
  const sortedLatencies = Object.entries(latencies).sort((a, b) => a[1] - b[1]);
  const optimalRPC = sortedLatencies[0][0];

  return new ethers.providers.JsonRpcProvider(optimalRPC, {
    name: optimalRPC,
    chainId: networkId,
    ensAddress: "",
  });
}

let isTestCompleted = false;

export async function getOptimalProvider(networkId: number): Promise<JsonRpcProvider> {
  // If the test is already completed for this session, return the fastest RPC provider
  if (isTestCompleted) {
    return getFastestRpcProvider(networkId);
  }

  // If the test is not completed yet, check if there are any latencies stored in the localStorage
  const latencies: Record<string, number> = JSON.parse(localStorage.getItem("rpcLatencies") || "{}");
  if (Object.keys(latencies).length > 0) {
    // If there are latencies stored in the localStorage, use the previous best RPC
    const provider = getFastestRpcProvider(networkId);
    // Start the test in the background
    testRpcPerformance(networkId)
      .then(() => {
        isTestCompleted = true;
      })
      .catch(console.error);
    return provider;
  } else {
    // If it's the user's first time and there are no latencies stored in the localStorage,
    // wait for the test to finish and then return the fastest RPC provider
    await testRpcPerformance(networkId);
    isTestCompleted = true;
    return getFastestRpcProvider(networkId);
  }
}
