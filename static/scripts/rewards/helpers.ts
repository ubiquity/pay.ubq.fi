import { RewardPermit } from "./render-transaction/tx-type";
import { networkExplorers } from "./constants";

export function currentExplorerUrl(reward?: RewardPermit) {
  if (!reward) {
    return "https://etherscan.io";
  }
  return networkExplorers[reward.networkId] || "https://etherscan.io";
}

export function networkId(reward?: RewardPermit) {
  return reward?.networkId ?? null;
}
