export enum NetworkIds {
  Mainnet = "0x1",
  Goerli = "0x5",
  Gnosis = "0x64",
}

export enum Tokens {
  DAI = "0x6b175474e89094c44da98b954eedeac495271d0f",
  WXDAI = "0xe91d153e0b41518a2ce8dd3d7944fa863463a97d",
}

export const networkNames = {
  [NetworkIds.Mainnet]: "Ethereum Mainnet",
  [NetworkIds.Goerli]: "Goerli Testnet",
  [NetworkIds.Gnosis]: "Gnosis Chain",
};

export const networkExplorers = {
  [NetworkIds.Mainnet]: "https://etherscan.io",
  [NetworkIds.Goerli]: "https://goerli.etherscan.io",
  [NetworkIds.Gnosis]: "https://gnosisscan.io",
};

export const networkRpcs = {
  [NetworkIds.Mainnet]: "https://rpc-pay.ubq.fi/v1/mainnet",
  [NetworkIds.Goerli]: "https://rpc-pay.ubq.fi/v1/goerli",
  [NetworkIds.Gnosis]: "https://rpc.gnosischain.com",
};

export const permit2Address = "0x000000000022D473030F116dDEE9F6B43aC78BA3";
