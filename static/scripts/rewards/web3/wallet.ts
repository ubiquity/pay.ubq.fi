import { JsonRpcSigner } from "@ethersproject/providers";
import { ethers } from "ethers";
import { getNetworkName, networkCurrencies, networkExplorers, networkRpcs } from "../constants";
import invalidateButton from "../invalidate-component";
import { claimButton, loadingClaimButton, resetClaimButton, toaster } from "../toaster";

export async function connectWallet(): Promise<JsonRpcSigner | null> {
  try {
    const provider = new ethers.providers.Web3Provider(window.ethereum, "any");
    await provider.send("eth_requestAccounts", []);
    const signer = provider.getSigner();
    resetClaimButton();
    return signer;
  } catch (error: unknown) {
    if (error instanceof Error) {
      if (error?.message?.includes("missing provider")) {
        toaster.create("info", "Please use a web3 enabled browser to collect this reward.");
        claimButton.element.disabled = true;
      } else {
        toaster.create("info", "Please connect your wallet to collect this reward.");
        claimButton.element.disabled = true;
      }
    }
    return null;
  }
}

export async function handleNetwork(desiredNetworkId: number) {
  const web3provider = new ethers.providers.Web3Provider(window.ethereum);
  if (!web3provider || !web3provider.provider.isMetaMask) {
    toaster.create("info", "Please connect to MetaMask.");
    loadingClaimButton(false);
    invalidateButton.disabled = true;
  }

  const currentNetworkId = (await web3provider.getNetwork()).chainId;

  // watch for network changes
  window.ethereum.on("chainChanged", <T>(newNetworkId: T | string) => handleIfOnCorrectNetwork(parseInt(newNetworkId as string, 16), desiredNetworkId));

  // if its not on ethereum mainnet, gnosis, or goerli, display error
  notOnCorrectNetwork(currentNetworkId, desiredNetworkId, web3provider);
}

function notOnCorrectNetwork(currentNetworkId: number, desiredNetworkId: number, web3provider: ethers.providers.Web3Provider) {
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
    switchNetwork(web3provider, desiredNetworkId).catch((error) => {
      console.error(error);
      toaster.create("error", `Please switch to the ${networkName} network to claim this reward.`);
    });
  }
}

function handleIfOnCorrectNetwork(currentNetworkId: number, desiredNetworkId: number) {
  if (desiredNetworkId === currentNetworkId) {
    // enable the button once on the correct network
    resetClaimButton();
    invalidateButton.disabled = false;
  } else {
    loadingClaimButton(false);
    invalidateButton.disabled = true;
  }
}

export async function switchNetwork(provider: ethers.providers.Web3Provider, networkId: number): Promise<boolean> {
  try {
    await provider.send("wallet_switchEthereumChain", [{ chainId: "0x" + networkId.toString(16) }]);
    return true;
  } catch (error: unknown) {
    // Add network if it doesn't exist.
    const code = (error as { code: number }).code;
    if (code == 4902) {
      return await addNetwork(provider, networkId);
    }
    return false;
  }
}

export async function addNetwork(provider: ethers.providers.Web3Provider, networkId: number): Promise<boolean> {
  try {
    await provider.send("wallet_addEthereumChain", [
      {
        chainId: "0x" + networkId.toString(16),
        chainName: getNetworkName(networkId),
        rpcUrls: networkRpcs[networkId],
        blockExplorerUrls: [networkExplorers[networkId]],
        nativeCurrency: networkCurrencies[networkId],
      },
    ]);
    return true;
  } catch (error: unknown) {
    return false;
  }
}
