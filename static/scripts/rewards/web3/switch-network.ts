import { ethers } from "ethers";
import { app } from "../render-transaction/index";

export async function switchNetwork(provider: ethers.providers.Web3Provider): Promise<boolean> {
  try {
    await provider.send("wallet_switchEthereumChain", [{ chainId: app.claimNetworkId }]);
    return true;
  } catch (error: any) {
    return false;
  }
}
