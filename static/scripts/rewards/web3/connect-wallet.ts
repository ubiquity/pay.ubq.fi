import { claimButton, resetClaimButton, toaster } from "../toaster";
import { JsonRpcSigner } from "@ethersproject/providers";
import { ethers } from "ethers";

export async function connectWallet(): Promise<JsonRpcSigner | null> {
  try {
    if (!window.ethereum) {
      console.error("Ethereum provider not found");
      return null;
    }

    const wallet = new ethers.providers.Web3Provider(window.ethereum);
    const signer = wallet.getSigner();
    const address = await signer.getAddress();
    if (!address) {
      console.error("Wallet not connected");
      return null;
    }

    resetClaimButton();
    return signer;
  } catch (error: unknown) {
    if (error instanceof Error) {
      console.error(error);
      if (error?.message?.includes("missing provider")) {
        toaster.create("info", "Please use a web3 enabled browser to collect this reward.");
        claimButton.element.disabled = true;
      } else {
        toaster.create("info", "Please connect your wallet to collect this reward.");
        claimButton.element.disabled = true;
      }
    }
    return null;
  }
}
