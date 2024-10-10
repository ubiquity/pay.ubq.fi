import { ethers } from "ethers";
import { getNetworkName, networkCurrencies, networkExplorers, networkRpcs } from "./rpc-handler/rpc-handler";

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
