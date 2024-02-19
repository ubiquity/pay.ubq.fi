import { reverseEnsInterface, UBIQUITY_RPC_ENDPOINT } from "./ens-lookup";

export async function queryReverseEns(address: string) {
  const data = reverseEnsInterface.encodeFunctionData("getNames", [[address.substring(2)]]);

  const response = await fetch(UBIQUITY_RPC_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: "1",
      method: "eth_call",
      params: [{ to: "0x3671aE578E63FdF66ad4F3E12CC0c0d71Ac7510C", data: data }, "latest"],
    }),
  });

  return response.text();
}
