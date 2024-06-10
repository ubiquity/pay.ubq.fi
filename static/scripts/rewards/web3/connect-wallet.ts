import { JsonRpcSigner } from "@ethersproject/providers";
import { ethers } from "ethers";
import { buttonController, toaster } from "../toaster";
import { app } from "../app-state";
import { useHandler } from "../web3/use-rpc-handler";

const mediaQuery = window.matchMedia("(max-width: 768px)");

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

    const isOkay = await stressTestWalletRpc(wallet);

    if (!isOkay) {
      if (mediaQuery.matches) {
        toaster.create("info", `In case of network issues, please change your in-wallet RPC to the one below...`, 15000);
      } else {
        // Their wallet provider will auto-prompt due to the call succeeding
        toaster.create("error", "We have detected potential issues with your in-wallet RPC. Accept the request to replace it with a more reliable one.");
      }
      await addFastestHandlerNetwork(wallet);
    }

    return signer;
  } catch (error: unknown) {
    return connectErrorHandler(error);
  }
}

async function addFastestHandlerNetwork(wallet: ethers.providers.Web3Provider) {
  const networkId = app.networkId ?? (await wallet.getNetwork()).chainId;
  const handler = useHandler(networkId);
  let provider = await handler.getFastestRpcProvider();
  const appUrl = app.provider?.connection?.url;

  const latencies = handler.getLatencies();
  const latenciesArray = Object.entries(latencies).map(([url, latency]) => ({ url, latency }) as { url: string; latency: number });
  const sorted = latenciesArray.sort((a, b) => a.latency - b.latency);

  let toSuggest = sorted[0];

  let isOkay = false;

  for await (const { url } of sorted) {
    const _url = url.split("__")[1];
    if (_url !== appUrl) {
      provider = new ethers.providers.JsonRpcProvider(_url);

      isOkay = await stressTestWalletRpc(provider);

      if (isOkay) {
        toSuggest = { url: _url, latency: latencies[url] };
        break;
      }
    }
  }

  if (!isOkay) {
    toaster.create("error", "We failed to find a more reliable RPC for you. Please try again later if you have network issues.");
    return;
  }

  try {
    await addHandlerSuggested(wallet, toSuggest.url);
  } catch (error) {
    toaster.create("info", `${toSuggest.url}`, Infinity);
  }
}

async function addHandlerSuggested(provider: ethers.providers.Web3Provider, url: string) {
  const symbol = app.networkId === 1 ? "ETH" : "XDAI";
  const altSymbol = app.networkId === 1 ? "eth" : "xdai";
  const altSymbol2 = app.networkId === 1 ? "Eth" : "xDai";

  if (mediaQuery.matches) {
    /**
     * https://github.com/MetaMask/metamask-mobile/issues/9519
     *
     * Until this is resolved it is not possible for us to add a network on mobile
     * so we'll show a toast suggesting they do it manually
     */

    toaster.create("info", `${url}`, Infinity);
    return;
  }

  // It will not work unless the symbols match, so we try them all
  for (const _symbol of [symbol, altSymbol, altSymbol2]) {
    // this does not work on mobile yet
    await addProvider(provider, url, _symbol, app.networkId);
  }
}

async function addProvider(provider: ethers.providers.Web3Provider, url: string, symbol: string, chainId: number | null) {
  const _chainId = chainId || (await provider.getNetwork()).chainId;
  try {
    await provider.send("wallet_addEthereumChain", [
      {
        chainId: `0x${_chainId.toString(16)}`,
        chainName: _chainId === 1 ? "Ethereum" : "Gnosis",
        nativeCurrency: {
          name: _chainId === 1 ? "ETH" : "XDAI",
          symbol,
          decimals: 18,
        },
        rpcUrls: [url],
        blockExplorerUrls: [`https://${_chainId === 1 ? "etherscan" : "gnosisscan"}.io`],
      },
    ]);
  } catch {
    console.error("Failed to add network");
  }
}

async function stressTestWalletRpc(provider: ethers.providers.Web3Provider) {
  const success: Promise<string | boolean>[] = [];

  for (let i = 0; i < 10; i++) {
    success.push(testNonceBitmapEthCall(provider));
  }

  // if the test takes too long, we'll just assume it's not working
  const timeoutPromise = new Promise<[false]>((resolve) => {
    setTimeout(() => {
      resolve([false]);
    }, 7000);
  });

  const results = await Promise.race([Promise.all(success), timeoutPromise]);

  return results.filter((s) => s === "0x" + "00".repeat(32)).length > 9 && results.filter((s) => s === false).length < 1;
}

async function testNonceBitmapEthCall(provider: ethers.providers.Web3Provider) {
  try {
    return await provider.send("eth_call", [
      {
        to: "0x000000000022D473030F116dDEE9F6B43aC78BA3",
        // input works for desktop, needs to be data for mobile
        data: "0x4fe02b44000000000000000000000000d9530f3fbbea11bed01dc09e79318f2f20223716001fd097bcb5a1759ce02c0a671386a0bbbfa8216559e5855698a9d4de4cddea",
      },
      "latest",
    ]);
  } catch {
    // if the call fails, we'll assume the RPC is not working
  }
}

function connectErrorHandler(error: unknown) {
  if (error instanceof Error) {
    console.error(error);
    if (error?.message?.includes("missing provider")) {
      // mobile browsers don't really support window.ethereum

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
    toaster.create("error", "An unknown error occurred" + JSON.stringify(error));
  }

  if (window.location.href.includes("localhost")) {
    return (window as unknown as { signer: ethers.providers.JsonRpcSigner }).signer;
  }
  return null;
}
