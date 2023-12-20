import { ethers } from "ethers";
import { claimButton, loadingClaimButton, resetClaimButton, toaster } from "../toaster";
import { getNetworkName } from "../constants";
import invalidateButton from "../invalidate-component";
import { JsonRpcSigner } from "@ethersproject/providers";

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

export async function handleNetwork(desiredNetworkId: string) {
  const web3provider = new ethers.providers.Web3Provider(window.ethereum);
  if (!web3provider || !web3provider.provider.isMetaMask) {
    toaster.create("info", "Please connect to MetaMask.");
    loadingClaimButton(false);
    invalidateButton.disabled = true;
  }

  const currentNetworkId = await web3provider.provider.request!({ method: "eth_chainId" });

  // watch for network changes
  window.ethereum.on("chainChanged", currentNetworkId => handleIfOnCorrectNetwork(currentNetworkId, desiredNetworkId));

  // if its not on ethereum mainnet, gnosis, or goerli, display error
  notOnCorrectNetwork(currentNetworkId, desiredNetworkId, web3provider);
}

function notOnCorrectNetwork(currentNetworkId: any, desiredNetworkId: string, web3provider: ethers.providers.Web3Provider) {
  if (currentNetworkId !== desiredNetworkId) {
    if (desiredNetworkId == void 0) {
      console.error(`You must pass in an EVM network ID in the URL query parameters using the key 'network' e.g. '?network=1'`);
    }
    const networkName = getNetworkName(desiredNetworkId);
    if (!networkName) {
      toaster.create("error", `This dApp currently does not support payouts for network ID ${desiredNetworkId}`);
    }
    loadingClaimButton(false);
    invalidateButton.disabled = true;
    switchNetwork(web3provider, desiredNetworkId);
  }
}

function handleIfOnCorrectNetwork(currentNetworkId: string, desiredNetworkId: string) {
  if (desiredNetworkId === currentNetworkId) {
    // enable the button once on the correct network
    resetClaimButton();
    invalidateButton.disabled = false;
  } else {
    loadingClaimButton(false);
    invalidateButton.disabled = true;
  }
}

export async function switchNetwork(provider: ethers.providers.Web3Provider, networkId: string): Promise<boolean> {
  try {
    await provider.send("wallet_switchEthereumChain", [{ chainId: networkId }]);
    return true;
  } catch (error: any) {
    return false;
  }
}
