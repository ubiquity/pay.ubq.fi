import { Chain, ChainMap } from "../constants";

export const getBlockInfo = async (blockNumber: string, chain: Chain) => {
  return await localStorage.getItem(`${ChainMap[chain]}:${blockNumber}`);
};

export const updateBlockInfo = async (blockNumber: string, timestamp: string, chain: Chain) => {
  await localStorage.setItem(`${ChainMap[chain]}:${blockNumber}`, timestamp);
};
