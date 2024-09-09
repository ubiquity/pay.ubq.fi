import { JsonRpcProvider, JsonRpcSigner } from "@ethersproject/providers";
import { Permit } from "@ubiquibot/permit-generation/types";
import { networkExplorers } from "@ubiquity-dao/rpc-handler";

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

  get provider(): JsonRpcProvider {
    return this._provider;
  }

  set provider(value: JsonRpcProvider) {
    this._provider = value;
  }

  get rewardIndex(): number {
    return this._currentIndex;
  }

  getCurrentExplorerUrl(claim: Permit): string {
    if (!claim) {
      return "https://blockscan.com";
    }
    return networkExplorers[claim.networkId] || "https://blockscan.com";
  }
}

export const app = new AppState();
