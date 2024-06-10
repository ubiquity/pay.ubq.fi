import { JsonRpcSigner } from "@ethersproject/providers";
import { ethers } from "ethers";
import { buttonController, toaster } from "../toaster";

export async function connectWallet(): Promise<JsonRpcSigner | null> {
  try {
    const wallet = new ethers.providers.Web3Provider(window.ethereum);

    window.history.pushState({}, "", "/");

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
    return connectErrorHandler(error);
  }
}

function connectErrorHandler(error: unknown) {
  if (error instanceof Error) {
    console.error(error);
    if (error?.message?.includes("missing provider")) {
      // mobile browsers don't really support window.ethereum
      const mediaQuery = window.matchMedia("(max-width: 768px)");

      if (mediaQuery.matches) {
        toaster.create("warning", "Please use a mobile-friendly Web3 browser such as MetaMask to collect this reward", Infinity);
      } else if (!window.ethereum) {
        toaster.create("warning", "Please use a web3 enabled browser to collect this reward.", Infinity);
        buttonController.hideAll();
      }
    } else {
      toaster.create("error", error.message);
    }
  } else {
    toaster.create("error", "An unknown error occurred.");
  }

  if (window.location.href.includes("localhost")) {
    return (window as unknown as { signer: ethers.providers.JsonRpcSigner }).signer;
  }
  return null;
}
