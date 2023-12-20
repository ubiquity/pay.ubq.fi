import { networkRpcs, networkExplorers } from "../constants";
import { Permit, NftMint, ClaimTx } from "./tx-type";

class AppState {
  public claimTxs: ClaimTx[] = [];
  private currentIndex = 0;

  get currentTx(): ClaimTx | null {
    return this.currentIndex < this.claimTxs.length ? this.claimTxs[this.currentIndex] : null;
  }

  get currentNetworkRpc(): string {
    if (!this.currentTx) {
      return "0x1";
    }
    return networkRpcs[this.currentTx.networkId] || "0x1";
  }

  get currentExplorerUrl(): string {
    if (!this.currentTx) {
      return "https://etherscan.io";
    }
    return networkExplorers[this.currentTx.networkId] || "https://etherscan.io";
  }

  nextTx(): ClaimTx | null {
    this.currentIndex++;
    return this.currentTx;
  }
}

export const app = new AppState();
