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

export async function testRpcPerformance(networkId: number) {
  const latencies: Record<string, number> = JSON.parse(localStorage.getItem("rpcLatencies") || "{}");

  const promises = networkRpcs[networkId].map(async (baseURL: string) => {
    try {
      const startTime = performance.now();
      const API = axios.create({
        baseURL,
        headers: RPC_HEADER,
      });

      const { data } = await API.post("", RPC_BODY).catch(() => ({ data: null }));
      const endTime = performance.now();
      const latency = endTime - startTime;
      if (verifyBlock(data)) {
        // Save the latency in localStorage
        latencies[`${baseURL}_${networkId}`] = latency;
      } else {
        // Save -1 in localStorage to indicate an error
        latencies[`${baseURL}_${networkId}`] = -1;
      }
    } catch (error) {
      // Save -1 in localStorage to indicate an error
      latencies[`${baseURL}_${networkId}`] = -1;
    }
  });

  await Promise.all(promises);
  localStorage.setItem("rpcLatencies", JSON.stringify(latencies));
}
