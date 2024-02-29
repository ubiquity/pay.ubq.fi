/* eslint-disable @typescript-eslint/no-floating-promises */
import axios from "axios";
import { networkRpcs } from "../constants";
import { Record } from "@sinclair/typebox";

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

function raceUntilSuccess(promises: Promise<unknown>[], latencies: Record<string | number, number>, runtimeRpcs: (string | number)[]) {
  return new Promise((resolve) => {
    promises.forEach((promise: Promise<unknown>, i: number) => {
      promise.then(resolve).catch(() => {
        // delete the rpc that failed then save again so the next iteration will not use it
        delete latencies[runtimeRpcs[i]];
        localStorage.setItem("rpcLatencies", JSON.stringify(latencies));
      });
    });
  });
}

export async function testRpcPerformance(networkId: number) {
  const latencies: Record<string | number, number> = JSON.parse(localStorage.getItem("rpcLatencies") || "{}");
  const refreshLatencies = JSON.parse(localStorage.getItem("refreshLatencies") || "0");

  // if there are no latencies or 5 visits in, then this is the first pass
  const shouldRefreshRpcs = Object.keys(latencies).filter((rpc) => rpc.endsWith(`_${networkId}`)).length <= 1 || refreshLatencies == 5;

  // use all the rpcs for the first pass or after 5 refreshes
  const runtimeRpcs = shouldRefreshRpcs
    ? networkRpcs[networkId]
    : // use cached otherwise
      Object.keys(latencies)
        .filter((rpc) => rpc.endsWith(`_${networkId}`))
        .map((rpc) => {
          if (latencies[rpc] < 0) {
            return ""; // null causes type error when indexing
          }

          if (rpc.includes("api_key") && rpc.endsWith(`_${networkId}`)) {
            return rpc.replace(`_${networkId}`, "");
          }

          return rpc.split("_")[0];
        });

  const promises = runtimeRpcs.map(async (baseURL: string) => {
    if (baseURL === "") {
      return;
    }
    const startTime = performance.now();
    const API = axios.create({
      baseURL,
      headers: RPC_HEADER,
      cancelToken: new axios.CancelToken((c) => {
        setTimeout(() => c("Request Timeout"), 500); // could increase this but I don't see why we would
      }),
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

  await raceUntilSuccess(promises, latencies, runtimeRpcs);

  // increment refreshLatencies
  localStorage.setItem("refreshLatencies", JSON.stringify(refreshLatencies + 1 <= 5 ? refreshLatencies + 1 : 0));
}
