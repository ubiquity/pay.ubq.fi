import { Chain, CHAIN_MAP } from "../constants";

export const getBlockInfo = async (blockNumber: string, chain: Chain) => {
  return await localStorage.getItem(`${CHAIN_MAP[chain]}:${blockNumber}`);
};

export const updateBlockInfo = async (blockNumber: string, timestamp: string, chain: Chain) => {
  await localStorage.setItem(`${CHAIN_MAP[chain]}:${blockNumber}`, timestamp);
};
