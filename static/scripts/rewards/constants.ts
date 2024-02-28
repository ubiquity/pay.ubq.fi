// type RPC = { url: string; tracking?: string; trackingDetails?: string };
// type Network = { name?: string; rpcs: RPC[]; websiteDead?: boolean; rpcWorking?: boolean };
// type Networks = { [key: string]: Network };

declare const extraRpcs: Record<string, string[]>; // @DEV: passed in at build time check build/esbuild-build.ts

export enum NetworkIds {
  Mainnet = 1,
  Goerli = 5,
  Gnosis = 100,
  Anvil = 31337,
}

export enum Tokens {
  DAI = "0x6b175474e89094c44da98b954eedeac495271d0f",
  WXDAI = "0xe91d153e0b41518a2ce8dd3d7944fa863463a97d",
}

export const networkNames = {
  [NetworkIds.Mainnet]: "Ethereum Mainnet",
  [NetworkIds.Goerli]: "Goerli Testnet",
  [NetworkIds.Gnosis]: "Gnosis Chain",
  [NetworkIds.Anvil]: "http://127.0.0.1:8545",
};

export const networkCurrencies: Record<number, object> = {
  [NetworkIds.Mainnet]: { symbol: "ETH", decimals: 18 },
  [NetworkIds.Goerli]: { symbol: "GoerliETH", decimals: 18 },
  [NetworkIds.Gnosis]: { symbol: "XDAI", decimals: 18 },
  [NetworkIds.Anvil]: { symbol: "XDAI", decimals: 18 },
};

export function getNetworkName(networkId?: number) {
  const networkName = networkNames[networkId as keyof typeof networkNames];
  if (!networkName) {
    console.error(`Unknown network ID: ${networkId}`);
  }
  return networkName ?? "Unknown Network";
}

export const networkExplorers: Record<number, string> = {
  [NetworkIds.Mainnet]: "https://etherscan.io",
  [NetworkIds.Goerli]: "https://goerli.etherscan.io",
  [NetworkIds.Gnosis]: "https://gnosisscan.io",
  [NetworkIds.Anvil]: "https://gnosisscan.io",
};

export const networkRpcs: Record<number, string[]> = {
  [NetworkIds.Mainnet]: ["https://rpc-pay.ubq.fi/v1/mainnet", ...(extraRpcs[NetworkIds.Mainnet] || [])],
  [NetworkIds.Goerli]: ["https://rpc-pay.ubq.fi/v1/goerli", ...(extraRpcs[NetworkIds.Goerli] || [])],
  [NetworkIds.Gnosis]: ["https://rpc.ankr.com/gnosis", ...(extraRpcs[NetworkIds.Gnosis] || [])],
  [NetworkIds.Anvil]: ["http://127.0.0.1:8545", ""],
};

export const permit2Address = "0x000000000022D473030F116dDEE9F6B43aC78BA3";
export const nftAddress = "0xAa1bfC0e51969415d64d6dE74f27CDa0587e645b";
