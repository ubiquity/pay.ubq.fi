import { JsonRpcSigner } from "@ethersproject/providers";
import { ethers } from "ethers";
import { buttonController, toaster } from "../toaster";
import { app } from "../app-state";

export async function connectWallet(): Promise<JsonRpcSigner | null> {
  try {
    const wallet = new ethers.providers.Web3Provider(window.ethereum);

    await wallet.send("eth_requestAccounts", []);

    const signer = wallet.getSigner();

    const address = await signer.getAddress();

    const provider = new ethers.providers.JsonRpcProvider(wallet.provider.url);

    if (!address) {
      buttonController.hideAll();
      console.error("Wallet not connected");
      return null;
    }

    const isOkay = await stressTestWalletRpc(provider);

    if (!isOkay) {
      toaster.create("error", "We have detected potential issues with your in-wallet RPC. Accept the request to replace it with a more reliable one.");
      await addFastestHandlerNetwork();
      return null;
    }

    return signer;
  } catch (error: unknown) {
    return connectErrorHandler(error);
  }
}

async function addFastestHandlerNetwork() {
  const provider = await useRpcHandler(app.networkId ?? provider.network.chainId);
  const url = provider.connection.url;

  try {
    await provider.request({
      method: "wallet_addEthereumChain",
      params: [
        {
          chainId: app.networkId,
          chainName: url,
          rpcUrls: [url],
        },
      ],
    });
  } catch (error) {
    console.error(error);
    toaster.create("error"`Failed to add optimal RPC network. Please add it manually. Network ID: ${app.networkId}, URL: ${url}`);
  }
}

async function stressTestWalletRpc(provider: ethers.providers.Web3Provider) {
  const success = [];

  for (let i = 0; i < 10; i++) {
    success.push(await testEthCall(provider));
  }

  return success.filter((s) => s === "0x" + "00".repeat(32)).length > 9;
}

async function testEthCall(provider: ethers.providers.Web3Provider) {
  try {
    return await provider.send("eth_call", [
      {
        to: "0x000000000022D473030F116dDEE9F6B43aC78BA3",
        input: "0x4fe02b44000000000000000000000000d9530f3fbbea11bed01dc09e79318f2f20223716001fd097bcb5a1759ce02c0a671386a0bbbfa8216559e5855698a9d4de4cddea",
      },
      "latest",
    ]);
  } catch (er) {
    console.log(er);
    return false;
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
