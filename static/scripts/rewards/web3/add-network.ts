import { getNetworkName, networkCurrencies, networkExplorers, networkRpcs } from "../constants";
import { Web3Provider } from "@ethersproject/providers";

export async function addNetwork(provider: Web3Provider, networkId: number): Promise<boolean> {
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
