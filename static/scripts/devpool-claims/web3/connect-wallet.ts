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
      createToast("error", "Please use a web3 enabled browser.");
      claimButton.disabled = true;
    } else {
      createToast("error", "Please connect your wallet.");
      claimButton.disabled = true;
    }
    return null;
  }
}
