import { txData } from "./render-transaction";

export const supportedChains = [
  "0x1", // mainnet
  "0x5", // goerli
  "0x64", // gnosis
];

export const chainName = {
  "0x1": "Ethereum Mainnet",
  "0x5": "Goerli Testnet",
  "0x64": "Gnosis Chain",
};

export const tokenChain = {
  "0x6b175474e89094c44da98b954eedeac495271d0f": "0x1", // DAI
  "0xe91d153e0b41518a2ce8dd3d7944fa863463a97d": "0x64", // WXDAI
};

export const chainExplorer = {
  "0x1": "https://etherscan.io",
  "0x5": "https://goerli.etherscan.io",
  "0x64": "https://gnosisscan.io",
};

export const chainRpc = {
  "0x1": "https://rpc-pay.ubq.fi/v1/mainnet",
  "0x5": "https://rpc-pay.ubq.fi/v1/goerli",
  "0x64": "https://rpc.gnosischain.com",
};

export const getExplorerUrl = (token: string): string => {
  const chainId = tokenChain[token.toLowerCase()];
  return chainExplorer[chainId];
};

export const checkIfChainIsCorrect = (chainId: string): boolean => {
  return supportedChains.includes(chainId) && chainId === tokenChain[txData.permit.permitted.token.toLowerCase()];
};
