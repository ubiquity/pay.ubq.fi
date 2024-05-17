// type RPC = { url: string; tracking?: string; trackingDetails?: string };
// type Network = { name?: string; rpcs: RPC[]; websiteDead?: boolean; rpcWorking?: boolean };
// type Networks = { [key: string]: Network };

declare const extraRpcs: Record<string, string[]>; // @DEV: passed in at build time check build/esbuild-build.ts

enum NetworkIds {
  Mainnet = 1,
  Goerli = 5,
  Gnosis = 100,
  Anvil = 31337,
}

const networkNames = {
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
  [NetworkIds.Mainnet]: extraRpcs[NetworkIds.Mainnet],
  [NetworkIds.Goerli]: extraRpcs[NetworkIds.Goerli],
  [NetworkIds.Gnosis]: extraRpcs[NetworkIds.Gnosis],
  [NetworkIds.Anvil]: ["http://127.0.0.1:8545"],
};

const nftAddress = "0xAa1bfC0e51969415d64d6dE74f27CDa0587e645b";
