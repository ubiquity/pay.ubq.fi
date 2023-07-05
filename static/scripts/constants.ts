export enum Network {
  Mainnet = "0x1",
  Goerli = "0x5",
  Gnosis = "0x64",
}

export enum Token {
  DAI = "0x6b175474e89094c44da98b954eedeac495271d0f",
  WXDAI = "0xe91d153e0b41518a2ce8dd3d7944fa863463a97d",
}

export const networkName = {
  [Network.Mainnet]: "Ethereum Mainnet",
  [Network.Goerli]: "Goerli Testnet",
  [Network.Gnosis]: "Gnosis Chain",
};

export const networkExplorer = {
  [Network.Mainnet]: "https://etherscan.io",
  [Network.Goerli]: "https://goerli.etherscan.io",
  [Network.Gnosis]: "https://gnosisscan.io",
};

export const networkRpc = {
  [Network.Mainnet]: "https://rpc-pay.ubq.fi/v1/mainnet",
  [Network.Goerli]: "https://rpc-pay.ubq.fi/v1/goerli",
  [Network.Gnosis]: "https://rpc.gnosischain.com",
};
