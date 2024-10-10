import { JsonRpcProvider, JsonRpcSigner } from "@ethersproject/providers";
import { networkExplorers } from "./web3/rpc-handler/rpc-handler";
import { PermitReward } from "./web3/rpc-handler/permit-reward";

export class AppState {
  public claims: PermitReward[] = [];
  public claimTxs: Record<string, string> = {};
  private _provider!: JsonRpcProvider;
  private _currentIndex = 0;
  private _signer: JsonRpcSigner | null = null;

  get signer() {
    return this._signer;
  }

  set signer(value) {
    this._signer = value;
  }

  get networkId(): number | null {
    return this.reward?.networkId || null;
  }

  get provider(): JsonRpcProvider {
    return this._provider;
  }

  set provider(value: JsonRpcProvider) {
    this._provider = value;
  }

  get rewardIndex(): number {
    return this._currentIndex;
  }

  get reward(): PermitReward | null {
    return this.rewardIndex < this.claims.length ? this.claims[this.rewardIndex] : this.claims[0];
  }

  get permitNetworkId() {
    return this.reward?.networkId;
  }

  get currentExplorerUrl(): string {
    if (!this.reward) {
      return "https://blockscan.com";
    }
    return networkExplorers[this.reward.networkId] || "https://blockscan.com";
  }

  nextPermit(): PermitReward | null {
    this._currentIndex = Math.min(this.claims.length - 1, this.rewardIndex + 1);
    return this.reward;
  }

  previousPermit(): PermitReward | null {
    this._currentIndex = Math.max(0, this._currentIndex - 1);
    return this.reward;
  }
}

export const app = new AppState();
