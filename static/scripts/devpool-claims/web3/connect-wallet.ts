import { JsonRpcSigner } from "@ethersproject/providers";
import { ethers } from "ethers";
import { createToast } from "../toaster";

export async function connectWallet(): Promise<JsonRpcSigner> {
  try {
    const provider = new ethers.providers.Web3Provider(window.ethereum, "any");
    await provider.send("eth_requestAccounts", []);
    const signer = provider.getSigner();
    return signer;
  } catch (error: any) {
    if (error?.message?.includes("missing provider")) {
      createToast("error", "Error: Please use a web3 enabled browser.");
    } else {
      createToast("error", "Error: Please connect your wallet.");
    }
    return {} as JsonRpcSigner;
  }
}
