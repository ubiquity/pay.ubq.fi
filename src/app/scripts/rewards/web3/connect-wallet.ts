import { Web3Provider, JsonRpcSigner } from "@ethersproject/providers";
import { getButtonController } from "../toaster";

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
    console.error("Error connecting wallet", error);
    return null;
  }
}
