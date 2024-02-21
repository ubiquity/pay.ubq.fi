import { JsonRpcProvider } from "@ethersproject/providers";
import { networkExplorers } from "./constants";
import { ClaimTx } from "./render-transaction/tx-type";

export class AppState {
  public claims: ClaimTx[] = [];
  private _provider!: JsonRpcProvider;
  private _networkId: number | null = null;
  private _currentIndex = 0;
  // private _networkRpc: string;

  get networkId(): number | null {
    return this.transaction.networkId;
  }

  set networkId(value: number) {
    this._networkId = value;
  }

  get provider(): JsonRpcProvider {
    return this._provider;
  }

  set provider(value: JsonRpcProvider) {
    this._provider = value;
  }

  get transactionIndex(): number {
    return this._currentIndex;
  }

  get transaction(): ClaimTx | null {
    return this.transactionIndex < this.claims.length ? this.claims[this.transactionIndex] : null;
  }

  get transactionNetworkId() {
    return this.transaction?.networkId;
  }

  get networkRpc(): string {
    return this._networkRpc;
  }

  get currentExplorerUrl(): string {
    if (!this.transaction) {
      return "https://etherscan.io";
    }
    return networkExplorers[this.transaction.networkId] || "https://etherscan.io";
  }

  nextTx(): ClaimTx | null {
    this._currentIndex = Math.min(this.claims.length - 1, this._currentIndex + 1);
    return this.transaction;
  }

  previousTx(): ClaimTx | null {
    this._currentIndex = Math.max(0, this._currentIndex - 1);
    return this.transaction;
  }
}

export const app = new AppState();
