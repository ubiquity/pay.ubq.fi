import { JsonRpcSigner } from "@ethersproject/providers";
import { ethers } from "ethers";
import { toaster, claimButton, resetClaimButton } from "../toaster";

export async function connectWallet(): Promise<JsonRpcSigner | null> {
  try {
    const provider = new ethers.providers.Web3Provider(window.ethereum, "any");
    await provider.send("eth_requestAccounts", []);
    const signer = provider.getSigner();
    resetClaimButton();
    return signer;
  } catch (error: any) {
    if (error?.message?.includes("missing provider")) {
      toaster.create("info", "Please use a web3 enabled browser to collect this reward.");
      claimButton.element.disabled = true;
    } else {
      toaster.create("info", "Please connect your wallet to collect this reward.");
      claimButton.element.disabled = true;
    }
    return null;
  }
}
