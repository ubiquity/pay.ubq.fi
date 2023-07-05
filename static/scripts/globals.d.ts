import { TxType } from "./render-transaction";
import { DrawConfig } from "./draw";

export interface Ethereumish {
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
    ethereum: Ethereumish;
    draw(settings: DrawConfig): void;
    txData: TxType;
  }
}
