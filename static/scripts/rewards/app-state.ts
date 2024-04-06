import { JsonRpcProvider, JsonRpcSigner } from "@ethersproject/providers";
import { RewardPermit } from "./render-transaction/tx-type";

export class AppState {
  public claims: RewardPermit[] = [];
  public claimTxs: Record<string, string> = {};
  private _provider!: JsonRpcProvider;
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
}

export const app = new AppState();
