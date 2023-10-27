import { JsonRpcSigner } from "@ethersproject/providers";
import { ethers } from "ethers";
import { toaster, claimButton, resetClaimButton } from "../toaster";

export async function connectWallet(retry = false): Promise<JsonRpcSigner | null> {
  try {
    const provider = new ethers.providers.Web3Provider(window.ethereum, "any");

    if (retry) {
      await provider.send("eth_requestAccounts", []);
    }

    const signer = provider.getSigner();
    resetClaimButton();
    return signer;
  } catch (error: any) {
    if (error?.message?.includes("missing provider")) {
      toaster.create("info", "Please use a web3 enabled browser to collect this reward.");
    }
    return null;
  }
}
