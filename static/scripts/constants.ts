import { txData } from "./render-transaction";

export enum Chain {
  Mainnet = "0x1",
  Goerli = "0x5",
  Gnosis = "0x64",
}

export enum Token {
  DAI = "0x6b175474e89094c44da98b954eedeac495271d0f",
  WXDAI = "0xe91d153e0b41518a2ce8dd3d7944fa863463a97d",
}

export const chainName = {
  [Chain.Mainnet]: "Ethereum Mainnet",
  [Chain.Goerli]: "Goerli Testnet",
  [Chain.Gnosis]: "Gnosis Chain",
};

export const chainExplorer = {
  [Chain.Mainnet]: "https://etherscan.io",
  [Chain.Goerli]: "https://goerli.etherscan.io",
  [Chain.Gnosis]: "https://gnosisscan.io",
};

export const chainRpc = {
  [Chain.Mainnet]: "https://rpc-pay.ubq.fi/v1/mainnet",
  [Chain.Goerli]: "https://rpc-pay.ubq.fi/v1/goerli",
  [Chain.Gnosis]: "https://rpc.gnosischain.com",
};
