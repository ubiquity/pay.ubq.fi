import { ethers } from "ethers";
import { getNetworkName } from "@ubiquity-dao/rpc-handler";
import { buttonControllers, toaster } from "../toaster";
import { switchNetwork } from "./switch-network";

export function notOnCorrectNetwork(currentNetworkId: number, desiredNetworkId: number, web3provider: ethers.providers.Web3Provider) {
  if (currentNetworkId !== desiredNetworkId) {
    const networkName = getNetworkName(desiredNetworkId);
    if (!networkName) {
      toaster.create("error", `This dApp currently does not support payouts for network ID ${desiredNetworkId}`);
    }
    switchNetwork(web3provider, desiredNetworkId).catch((error) => {
      console.error(error);
      toaster.create("error", `Please switch to the ${networkName} network to claim this reward.`);
      // Display error for each permit
      Object.keys(buttonControllers).forEach((key) => buttonControllers[key].hideAll());
    });
  }
}
