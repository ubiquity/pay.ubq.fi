import { ethers } from "ethers";
import { buttonController, toaster } from "../toaster";
import { handleIfOnCorrectNetwork } from "./handle-if-on-correct-network";
import { notOnCorrectNetwork } from "./not-on-correct-network";

// verifyCurrentNetwork checks if the user is on the correct network and displays an error if not
export async function verifyCurrentNetwork(desiredNetworkId: number) {
  const web3provider = new ethers.providers.Web3Provider(window.ethereum);
  if (!web3provider || !web3provider.provider.isMetaMask) {
    toaster.create("info", "Please connect to MetaMask.");
    buttonController.hideAll();
  }

  const network = await web3provider.getNetwork();
  const currentNetworkId = network.chainId;

  // watch for network changes
  window.ethereum.on("chainChanged", <T>(newNetworkId: T | string) => handleIfOnCorrectNetwork(parseInt(newNetworkId as string, 16), desiredNetworkId));

  // if its not on ethereum mainnet, gnosis, or goerli, display error
  notOnCorrectNetwork(currentNetworkId, desiredNetworkId, web3provider);
}
