import { JsonRpcSigner } from "@ethersproject/providers";
import { toaster, claimButton, resetClaimButton } from "../toaster";
import { EthereumPrivateKeyProvider } from "@web3auth/ethereum-provider";
import { ethers } from "ethers";
import { RelayPack } from "@safe-global/relay-kit";
import { AccountAbstraction } from "./pay";

export interface AccountAbstractionConfig {
  relayPack: RelayPack;
}

export async function connectWallet(): Promise<JsonRpcSigner | null> {
  try {
    const provider = new ethers.providers.Web3Provider(window.ethereum);

    await AccountAbstraction(provider, true);

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
