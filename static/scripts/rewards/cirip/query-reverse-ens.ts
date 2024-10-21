import { ethers } from "ethers";
import { useHandler } from "../web3/use-rpc-handler";

export async function queryReverseEns(address: string) {
  // Try to get the ENS name from localStorage
  const cachedEnsName = localStorage.getItem(address);

  const handler = useHandler(1);
  // todo fix .getFirstAvailableRpcProvider() can return wss:// in error
  const provider = await handler.getFastestRpcProvider();
  if (!provider) {
    console.error("ENS lookup failed: No provider found");
    return "";
  }
  const endpoint = provider.connection.url;

  // Let's drop the old cache.
  if (cachedEnsName && !cachedEnsName.trim().startsWith("{")) {
    // If the ENS name is in localStorage, return it
    return cachedEnsName;
  } else {
    // If the ENS name is not in localStorage, fetch it from the API
    const web3Provider = new ethers.providers.JsonRpcProvider(endpoint);
    const ensName = await web3Provider.lookupAddress(address);

    if (ensName === null) {
      console.error("ENS lookup failed: API request failed");
      return null;
    }

    // Store the ENS name in localStorage for future use
    localStorage.setItem(address, ensName);

    return ensName;
  }
}
