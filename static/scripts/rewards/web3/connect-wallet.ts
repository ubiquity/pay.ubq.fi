import { JsonRpcSigner } from "@ethersproject/providers";
import { ethers } from "ethers";
import { buttonController, toaster } from "../toaster";

export async function connectWallet(): Promise<JsonRpcSigner | null> {
  try {
    const wallet = new ethers.providers.Web3Provider(window.ethereum);

    await wallet.send("eth_requestAccounts", []);

    const signer = wallet.getSigner();

    const address = await signer.getAddress();

    if (!address) {
      buttonController.hideAll();
      console.error("Wallet not connected");
      return null;
    }

    return signer;
  } catch (error: unknown) {
    if (error instanceof Error) {
      console.error(error);
      if (error?.message?.includes("missing provider")) {
        toaster.create("info", "Please use a web3 enabled browser to collect this reward.");
      } else {
        toaster.create("info", "Please connect your wallet to collect this reward.");
      }
    }
    return null;
  }
}
