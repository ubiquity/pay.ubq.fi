import { ethers } from "ethers";
import { addNetwork } from "./add-network";

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
