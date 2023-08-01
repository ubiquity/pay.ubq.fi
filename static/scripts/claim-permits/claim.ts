import { JsonRpcSigner } from "@ethersproject/providers";
import { ethers } from "ethers";
import { connectWallet, singleToggle } from "../helpers";
import { toaster } from "../rewards/toaster";

let signer: JsonRpcSigner | undefined = undefined;

// Wait for the page to load
document.addEventListener("DOMContentLoaded", () => {
  // Add click event listener to the "Claim all" button
  const claimButton = document.getElementById("claimAll") as HTMLButtonElement;
  claimButton.addEventListener("click", claimAllPermits);
});

async function claimAllPermits() {
  try {
    // Check if Metamask is installed
    if (!window.ethereum) {
        singleToggle("error", `Error: Please install MetaMask or any other Ethereum wallet.`);
        return;
    }

    signer = await connectWallet();
    if (!signer) {
        singleToggle("error", `Error: Please connect to MetaMask.`);
        return;
    }

    const currentChainId = await signer.getChainId();
    const userAddress = await signer.getAddress()
    console.log(userAddress, currentChainId)

    // Get unclaimed permits from both Ethereum mainnet and Gnosis networks
    const unclaimedPermitsMainnet = await getUnclaimedPermits(userAddress, "mainnet");
    const unclaimedPermitsGnosis = await getUnclaimedPermits(userAddress, "gnosis");

    // Call the Multicall function with the permits data

    toaster.create("success", `Successfully claimed all permits!`);
  } catch (error) {
    console.error("Error while claiming permits:", error);
    toaster.create("error", "Error while claiming permits. Please check the console for more details.");
  }
}

// // Implement this function to fetch unclaimed permits from supabase db
async function getUnclaimedPermits(userAddress: string, network: string) {
  // For the sake of this example, let's return an empty array
  return [];
}

// // Implement this function to call the Multicall contract with the consolidated permit data