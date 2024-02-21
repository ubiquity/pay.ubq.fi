import { ethers } from "ethers";
import { getNetworkName } from "../constants";
import invalidateButton from "../invalidate-component";
import { loadingClaimButton, toaster } from "../toaster";
import { switchNetwork } from "./switch-network";

export function notOnCorrectNetwork(currentNetworkId: number, desiredNetworkId: number, web3provider: ethers.providers.Web3Provider) {
  if (currentNetworkId !== desiredNetworkId) {
    if (desiredNetworkId == void 0) {
      console.error(`You must pass in an EVM network ID in the URL query parameters using the key 'network' e.g. '?network=1'`);
    }
    const networkName = getNetworkName(desiredNetworkId);
    if (!networkName) {
      toaster.create("error", `This dApp currently does not support payouts for network ID ${desiredNetworkId}`);
    }
    loadingClaimButton(false);
    invalidateButton.disabled = true;
    switchNetwork(web3provider, desiredNetworkId).catch((error) => {
      console.error(error);
      toaster.create("error", `Please switch to the ${networkName} network to claim this reward.`);
    });
  }
}
