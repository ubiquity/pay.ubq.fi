export interface EthereumIsh {
  autoRefreshOnNetworkChange: boolean;
  chainId: string;
  isMetaMask?: boolean;
  isStatus?: boolean;
  networkVersion: string;
  selectedAddress: any;

  on(event: "close" | "accountsChanged" | "chainChanged" | "networkChanged", callback: (payload: any) => void): void;
  once(event: "close" | "accountsChanged" | "chainChanged" | "networkChanged", callback: (payload: any) => void): void;
}

declare global {
  interface Window {
    ethereum: EthereumIsh;
  }
}
