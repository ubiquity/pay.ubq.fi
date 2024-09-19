import { app } from "../app-state";
import { useRpcHandler } from "../web3/use-rpc-handler";
import { ethers } from "ethers";

const mainnetRpcUrl = "https://eth.api.onfinality.io/public";

export async function queryReverseEns(address: string, networkId: number) {
  // Try to get the ENS name from localStorage
  const cachedEnsName = localStorage.getItem(address);
  const endpoint = app.provider?.connection.url || (await useRpcHandler(app)).connection.url;

  if (!endpoint) {
    console.error("ENS lookup failed: No endpoint found for network ID", networkId);
    if (cachedEnsName) return cachedEnsName;
  }

  // Let's drop the old cache on the first run!
  if (cachedEnsName && !cachedEnsName.trim().startsWith("{")) {
    // If the ENS name is in localStorage, return it
    return cachedEnsName;
  } else {
    // If the ENS name is not in localStorage, fetch it from the API
    const web3Provider = new ethers.providers.JsonRpcProvider(mainnetRpcUrl);
    const ensName = await web3Provider.lookupAddress(address);

    if (ensName === null) {
      console.error("ENS lookup failed: API request failed");
      return "";
    }

    // Store the ENS name in localStorage for future use
    localStorage.setItem(address, ensName);

    return ensName;
  }
}
