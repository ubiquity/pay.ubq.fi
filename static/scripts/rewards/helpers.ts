import axios from "axios";
import { NetworkIds, networkRpcs } from "./constants";
import { Contract, ethers } from "ethers";
import { erc20Abi } from "./abis";
import { Type as T, StaticDecode } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";

type DataType = {
  jsonrpc: string;
  id: number;
  result: {
    number: string;
    timestamp: string;
    hash: string;
  };
};

const verifyBlock = (data: DataType) => {
  try {
    const { jsonrpc, id, result } = data;
    const { number, timestamp, hash } = result;
    return jsonrpc === "2.0" && id === 1 && parseInt(number, 16) > 0 && parseInt(timestamp, 16) > 0 && hash.match(/[0-9|a-f|A-F|x]/gm)?.join("").length === 66;
  } catch (error) {
    return false;
  }
};

const RPC_BODY = JSON.stringify({
  jsonrpc: "2.0",
  method: "eth_getBlockByNumber",
  params: ["latest", false],
  id: 1,
});

const RPC_HEADER = {
  "Content-Type": "application/json",
};

export const getErc20Contract = async (contractAddress: string, networkId: number): Promise<Contract> => {
  const providerUrl = await getOptimalRPC(networkId);
  const provider = new ethers.providers.JsonRpcProvider(providerUrl);
  const contractInstance = new ethers.Contract(contractAddress, erc20Abi, provider);
  return contractInstance;
};

export const getOptimalRPC = async (networkId: number): Promise<string> => {
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
      if (await verifyBlock(data)) {
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
  return optimalRPC;
};
