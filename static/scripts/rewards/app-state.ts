import { JsonRpcProvider, JsonRpcSigner } from "@ethersproject/providers";
import { Permit } from "@ubiquibot/permit-generation";
import { getNetworkExplorer } from "@ubiquity-dao/rpc-handler";
import { convertToNetworkId } from "../../../shared/use-rpc-handler";

export class AppState {
  public claims: Permit[] = [];
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

  get reward(): Permit {
    return this.rewardIndex < this.claims.length ? this.claims[this.rewardIndex] : this.claims[0];
  }

  get permitNetworkId() {
    return this.reward?.networkId;
  }

  get currentExplorerUrl(): string {
    const networkId = convertToNetworkId(this.reward.networkId);
    if (!this.reward || !getNetworkExplorer(networkId)) {
      return "https://blockscan.com";
    }

    return getNetworkExplorer(networkId)[0].url;
  }

  nextPermit(): Permit | null {
    this._currentIndex = Math.min(this.claims.length - 1, this.rewardIndex + 1);
    return this.reward;
  }

  previousPermit(): Permit | null {
    this._currentIndex = Math.max(0, this._currentIndex - 1);
    return this.reward;
  }
}

export const app = new AppState();
