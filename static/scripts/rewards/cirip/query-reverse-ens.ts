import { RPCHandler } from "@keyrxng/rpc-handler/dist/esm/src";
import { reverseEnsInterface } from "./ens-lookup";

export async function queryReverseEns(address: string, handler: RPCHandler) {
  // Try to get the ENS name from localStorage
  const cachedEnsName = localStorage.getItem(address);

  if (cachedEnsName) {
    // If the ENS name is in localStorage, return it
    return cachedEnsName;
  } else {
    // If the ENS name is not in localStorage, fetch it from the API
    const data = reverseEnsInterface.encodeFunctionData("getNames", [[address.substring(2)]]);

    const provider = handler.getProvider();

    const ensName = await provider.send("eth_call", [{ to: "0x3671aE578E63FdF66ad4F3E12CC0c0d71Ac7510C", data: data }, "latest"]);

    if (ensName === "0x") {
      return;
    }

    // Save the ENS name to localStorage
    localStorage.setItem(address, ensName);

    return ensName;
  }
}
