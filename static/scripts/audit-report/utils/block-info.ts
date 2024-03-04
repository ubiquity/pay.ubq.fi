import { Chain, CHAIN_MAP } from "../constants";

export async function getBlockInfo(blockNumber: string, chain: Chain) {
  return localStorage.getItem(`${CHAIN_MAP[chain]}:${blockNumber}`);
}

export async function updateBlockInfo(blockNumber: string, timestamp: string, chain: Chain) {
  localStorage.setItem(`${CHAIN_MAP[chain]}:${blockNumber}`, timestamp);
}
