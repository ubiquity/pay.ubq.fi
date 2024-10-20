import { ethers } from "ethers";
import { getNetworkName, getNetworkExplorer, getNetworkCurrency, getNetworkRpcs } from "@ubiquity-dao/rpc-handler";
import { convertToNetworkId } from "./use-rpc-handler";

export async function addNetwork(provider: ethers.providers.Web3Provider, networkId: number): Promise<boolean> {
  const networkIdTyped = convertToNetworkId(networkId);
  try {
    await provider.send("wallet_addEthereumChain", [
      {
        chainId: "0x" + networkId.toString(16),
        chainName: getNetworkName(networkIdTyped),
        rpcUrls: getNetworkRpcs(networkIdTyped).rpcs.map((rpc) => rpc.url),
        blockExplorerUrls: getNetworkExplorer(networkIdTyped).map((explorer) => explorer.url),
        nativeCurrency: getNetworkCurrency(networkIdTyped),
      },
    ]);
    return true;
  } catch (error: unknown) {
    return false;
  }
}
