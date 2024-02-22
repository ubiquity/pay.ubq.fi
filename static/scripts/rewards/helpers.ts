import axios from "axios";
import { Contract, ethers } from "ethers";
import { erc20Abi } from "./abis";
import { JsonRpcProvider } from "@ethersproject/providers";
import { networkRpcs, networkExplorers } from "./constants";

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

export async function getOptimalProvider(networkId: number) {
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
        return Promise.resolve({
          latency,
          baseURL,
        });
      } else {
        return Promise.reject();
      }
    } catch (error) {
      return Promise.reject();
    }
  });

  const { baseURL: optimalRPC } = await Promise.any(promises);
  return new ethers.providers.JsonRpcProvider(optimalRPC, {
    name: optimalRPC,
    chainId: networkId,
    ensAddress: "",
  });
}

export function getExplorerLinkForTx(networkId: number, hash: string): string {
  if (!hash) return "#";
  return `${networkExplorers[networkId]}/tx/${hash}`;
}

export function shortenTxHash(hash: string | undefined, length = 10): string {
  if (!hash) return "";

  const prefixLength = Math.floor(length / 2);
  const suffixLength = length - prefixLength;

  const prefix = hash.slice(0, prefixLength);
  const suffix = hash.slice(-suffixLength);

  return prefix + "..." + suffix;
}
