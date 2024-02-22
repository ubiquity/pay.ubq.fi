import axios from "axios";
import { networkRpcs } from "../constants";

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

function raceUntilSuccess(promises: Promise<unknown>[]) {
  return new Promise((resolve) => {
    promises.forEach((promise: Promise<unknown>) => {
      promise.then(resolve).catch(() => {});
    });
  });
}

export async function testRpcPerformance(networkId: number) {
  const latencies: Record<string, number> = JSON.parse(localStorage.getItem("rpcLatencies") || "{}");

  const promises = networkRpcs[networkId].map(async (baseURL: string) => {
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
      latencies[`${baseURL}_${networkId}`] = latency;
      localStorage.setItem("rpcLatencies", JSON.stringify(latencies));
    } else {
      // Throw an error to indicate an invalid block data
      throw new Error(`Invalid block data from ${baseURL}`);
    }
  });

  await raceUntilSuccess(promises);
}
