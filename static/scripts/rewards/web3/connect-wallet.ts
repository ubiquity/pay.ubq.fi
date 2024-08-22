import { JsonRpcSigner } from "@ethersproject/providers";
import { ethers } from "ethers";
import { buttonControllers, toaster } from "../toaster";
import { app } from "../app-state";
import { useHandler } from "../web3/use-rpc-handler";

function checkMobile(a: string) {
  // cspell:disable
  if (
    // eslint-disable-next-line no-useless-escape
    /(android|bb\d+|meego).+mobile|avantgo|bada\/|blackberry|blazer|compal|elaine|fennec|hiptop|iemobile|ip(hone|od)|iris|kindle|lge |maemo|midp|mmp|mobile.+firefox|netfront|opera m(ob|in)i|palm( os)?|phone|p(ixi|re)\/|plucker|pocket|psp|series(4|6)0|symbian|treo|up\.(browser|link)|vodafone|wap|windows ce|xda|xiino/i.test(
      a
    ) || // eslint-disable-next-line no-useless-escape
    /1207|6310|6590|3gso|4thp|50[1-6]i|770s|802s|a wa|abac|ac(er|oo|s\-)|ai(ko|rn)|al(av|ca|co)|amoi|an(ex|ny|yw)|aptu|ar(ch|go)|as(te|us)|attw|au(di|\-m|r |s )|avan|be(ck|ll|nq)|bi(lb|rd)|bl(ac|az)|br(e|v)w|bumb|bw\-(n|u)|c55\/|capi|ccwa|cdm\-|cell|chtm|cldc|cmd\-|co(mp|nd)|craw|da(it|ll|ng)|dbte|dc\-s|devi|dica|dmob|do(c|p)o|ds(12|\-d)|el(49|ai)|em(l2|ul)|er(ic|k0)|esl8|ez([4-7]0|os|wa|ze)|fetc|fly(\-|_)|g1 u|g560|gene|gf\-5|g\-mo|go(\.w|od)|gr(ad|un)|haie|hcit|hd\-(m|p|t)|hei\-|hi(pt|ta)|hp( i|ip)|hs\-c|ht(c(\-| |_|a|g|p|s|t)|tp)|hu(aw|tc)|i\-(20|go|ma)|i230|iac( |\-|\/)|ibro|idea|ig01|ikom|im1k|inno|ipaq|iris|ja(t|v)a|jbro|jemu|jigs|kddi|keji|kgt( |\/)|klon|kpt |kwc\-|kyo(c|k)|le(no|xi)|lg( g|\/(k|l|u)|50|54|\-[a-w])|libw|lynx|m1\-w|m3ga|m50\/|ma(te|ui|xo)|mc(01|21|ca)|m\-cr|me(rc|ri)|mi(o8|oa|ts)|mmef|mo(01|02|bi|de|do|t(\-| |o|v)|zz)|mt(50|p1|v )|mwbp|mywa|n10[0-2]|n20[2-3]|n30(0|2)|n50(0|2|5)|n7(0(0|1)|10)|ne((c|m)\-|on|tf|wf|wg|wt)|nok(6|i)|nzph|o2im|op(ti|wv)|oran|owg1|p800|pan(a|d|t)|pdxg|pg(13|\-([1-8]|c))|phil|pire|pl(ay|uc)|pn\-2|po(ck|rt|se)|prox|psio|pt\-g|qa\-a|qc(07|12|21|32|60|\-[2-7]|i\-)|qtek|r380|r600|raks|rim9|ro(ve|zo)|s55\/|sa(ge|ma|mm|ms|ny|va)|sc(01|h\-|oo|p\-)|sdk\/|se(c(\-|0|1)|47|mc|nd|ri)|sgh\-|shar|sie(\-|m)|sk\-0|sl(45|id)|sm(al|ar|b3|it|t5)|so(ft|ny)|sp(01|h\-|v\-|v )|sy(01|mb)|t2(18|50)|t6(00|10|18)|ta(gt|lk)|tcl\-|tdg\-|tel(i|m)|tim\-|t\-mo|to(pl|sh)|ts(70|m\-|m3|m5)|tx\-9|up(\.b|g1|si)|utst|v400|v750|veri|vi(rg|te)|vk(40|5[0-3]|\-v)|vm40|voda|vulc|vx(52|53|60|61|70|80|81|83|85|98)|w3c(\-| )|webc|whit|wi(g |nc|nw)|wmlb|wonu|x700|yas\-|your|zeto|zte\-/i.test(
      a.substring(0, 4)
    )
  ) {
    // cspell:enable
    return true;
  }
}

function mobileCheck() {
  return checkMobile(navigator.userAgent || navigator.vendor || (window as unknown as { opera: string }).opera);
}

export async function connectWallet(networkId: number): Promise<JsonRpcSigner | null> {
  try {
    const wallet = new ethers.providers.Web3Provider(window.ethereum);

    if (mobileCheck()) {
      // the param is too long and prevents a mobile user from connecting their wallet
      window.history.pushState({}, "", "/");
    }

    await wallet.send("eth_requestAccounts", []);

    const signer = wallet.getSigner();

    const address = await signer.getAddress();

    if (!address) {
      Object.keys(buttonControllers).forEach((key) => buttonControllers[key].hideAll());
      console.error("Wallet not connected");
      return null;
    }

    const isOkay = await stressTestWalletRpc(wallet);

    if (!isOkay) {
      if (mobileCheck()) {
        toaster.create("info", `In case of network issues, please change your in-wallet RPC to the one below...`, 15000);
      } else {
        // Their wallet provider will auto-prompt due to the call succeeding
        toaster.create("error", "We have detected potential issues with your in-wallet RPC. Accept the request to replace it with a more reliable one.");
      }
      await addFastestHandlerNetwork(wallet, networkId);
    }

    return signer;
  } catch (error: unknown) {
    return connectErrorHandler(error);
  }
}

async function addFastestHandlerNetwork(wallet: ethers.providers.Web3Provider, networkId: number) {
  const handler = useHandler(networkId ?? (await wallet.getNetwork()).chainId);
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
    await addHandlerSuggested(wallet, toSuggest.url, networkId);
  } catch (error) {
    toaster.create("info", `${toSuggest.url}`, Infinity);
  }
}

async function addHandlerSuggested(provider: ethers.providers.Web3Provider, url: string, networkId: number) {
  const symbol = networkId === 1 ? "ETH" : "XDAI";
  const altSymbol = networkId === 1 ? "eth" : "xdai";
  const altSymbol2 = networkId === 1 ? "Eth" : "xDai";

  if (mobileCheck()) {
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
    await addProvider(provider, url, _symbol, networkId);
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

  for (let i = 0; i < 6; i++) {
    success.push(testNonceBitmapEthCall(provider));
  }

  // if the test takes too long, we'll just assume it's not working
  const timeoutPromise = new Promise<[false]>((resolve) => {
    setTimeout(() => {
      resolve([false]);
    }, 7000);
  });

  const results = await Promise.race([Promise.all(success), timeoutPromise]);

  return results.filter((s) => s === "0x" + "00".repeat(32)).length > 5 && results.filter((s) => s === false).length < 1;
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

      if (mobileCheck()) {
        toaster.create("warning", "Please use a mobile-friendly Web3 browser such as MetaMask to collect this reward", Infinity);
      } else if (!window.ethereum) {
        toaster.create("warning", "Please use a web3 enabled browser to collect this reward.", Infinity);
        Object.keys(buttonControllers).forEach((key) => buttonControllers[key].hideAll());
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
