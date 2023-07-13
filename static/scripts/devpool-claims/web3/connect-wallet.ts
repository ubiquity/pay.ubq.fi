import { JsonRpcSigner } from "@ethersproject/providers";
import { ethers } from "ethers";
import { createToast, claimButton, resetClaimButton } from "../toaster";

export async function connectWallet(): Promise<JsonRpcSigner | null> {
  try {
    const provider = new ethers.providers.Web3Provider(window.ethereum, "any");
    await provider.send("eth_requestAccounts", []);
    const signer = provider.getSigner();
    resetClaimButton();
    return signer;
  } catch (error: any) {
    if (error?.message?.includes("missing provider")) {
      createToast("info", "Please use a web3 enabled browser to collect this reward.");
      claimButton.disabled = true;
    } else {
      createToast("info", "Please connect your wallet to collect this reward.");
      claimButton.disabled = true;
    }
    return null;
  }
}
