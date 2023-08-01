import { JsonRpcSigner } from "@ethersproject/providers";
import { ethers } from "ethers";
import { connectWallet, convertPermitToHex, singleToggle } from "../helpers";
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

    const hexData = convertPermitToHex({
        "permit": {
            "permitted": {
                "token": "0xe91D153E0b41518A2Ce8Dd3D7944Fa863463a97d",
                "amount": "300000000000000000000"
            },
            "nonce": "30455181331899692626343096230694572451896230780115478001487702629649527797301",
            "deadline": "115792089237316195423570985008687907853269984665640564039457584007913129639935"
        },
        "transferDetails": {
            "to": "0xf76F1ACB66020f893c95371f740549F312DEA3f1",
            "requestedAmount": "300000000000000000000"
        },
        "owner": "0xf87ca4583C792212e52720d127E7E0A38B818aD1",
        "signature": "0xb4433df0b699dfa82858e95c58f092a92c38a4b2a619f448db8d1b34aeda72245c22d269eff796dfe0b632383fa92b58c4ca8bbafae6aca0eff8237c6f6c317f1b"
    });
    console.log(hexData);

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