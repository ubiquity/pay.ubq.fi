import { addNetwork } from "./add-network";
import { getButtonController } from "../toaster";
import { Web3Provider } from "@ethersproject/providers";

export async function switchNetwork(provider: Web3Provider, networkId: number): Promise<boolean> {
  try {
    await provider.send("wallet_switchEthereumChain", [{ chainId: "0x" + networkId.toString(16) }]);
    getButtonController().showMakeClaim();
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
