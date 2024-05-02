import { Web3Provider } from "@ethersproject/providers";
import { getButtonController } from "../toaster";
import { JsonRpcSigner } from "ethers";

export async function connectWallet(): Promise<JsonRpcSigner | null> {
  try {
    const wallet = new Web3Provider(window.ethereum);

    await wallet.send("eth_requestAccounts", []);

    const signer = wallet.getSigner();

    const address = await signer.getAddress();

    if (!address) {
      getButtonController().hideAll();
      console.error("Wallet not connected");
      return null;
    }

    return signer;
  } catch (error: unknown) {
    // if (error instanceof Error) {
    //   console.error(error);
    //   if (error?.message?.includes("missing provider")) {
    //     toaster.create("info", "Please use a web3 enabled browser to collect this reward.");
    //   } else {
    //     toaster.create("info", "Please connect your wallet to collect this reward.");
    //   }
    // }
    return null;
  }
}
