import { ethers } from "ethers";
import chains from "../../../../lib/rpc2/src/fixtures/chains.json";
import { RpcHandler } from "../../../../lib/rpc2/src/rpc-handler";
import { ChainData } from "../../../../lib/rpc2/src/rpc-handler-types";

const rpcHandler = new RpcHandler(chains as ChainData[]);

export async function queryReverseEns(address: string, networkId: number) {
  // Try to get the ENS name from localStorage
  const cachedEnsName = localStorage.getItem(address);

  if (cachedEnsName && !cachedEnsName.trim().startsWith("{")) {
    // If the ENS name is in localStorage, return it
    return cachedEnsName;
  }

  try {
    // Prepare the reverse node name and compute its namehash
    const reverseNode = `${address.substring(2).toLowerCase()}.addr.reverse`;
    const namehash = ethers.utils.namehash(reverseNode);

    // Step 1: Get the resolver for the reverse node
    const resolverParams = ethers.utils.defaultAbiCoder.encode(["bytes32"], [namehash]);
    const resolverData = "0x0178b8bf" + resolverParams.substring(2); // selector for "resolver(bytes32)"

    const resolverResponse = await rpcHandler.sendRequest(networkId, {
      method: "eth_call",
      params: [
        {
          to: "0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e", // ENS Registry address on mainnet
          data: resolverData,
        },
        "latest",
      ],
    });

    const resolverAddress = ethers.utils.defaultAbiCoder.decode(["address"], resolverResponse.result)[0];

    if (resolverAddress === ethers.constants.AddressZero) {
      console.error("ENS lookup failed: No resolver found");
      return null;
    }

    // Step 2: Use the resolver to get the name associated with the reverse node
    const nameParams = ethers.utils.defaultAbiCoder.encode(["bytes32"], [namehash]);
    const nameData = "0x691f3431" + nameParams.substring(2); // selector for "name(bytes32)"

    const nameResponse = await rpcHandler.sendRequest(networkId, {
      method: "eth_call",
      params: [
        {
          to: resolverAddress,
          data: nameData,
        },
        "latest",
      ],
    });

    const ensNameHex = nameResponse.result;
    const ensName = ethers.utils.toUtf8String(ensNameHex);

    if (ensName && ensName !== "") {
      // Store the ENS name in localStorage for future use
      localStorage.setItem(address, ensName);
      return ensName;
    } else {
      console.error("ENS lookup failed: No name found");
      return "";
    }
  } catch (error) {
    console.error("ENS lookup failed:", error);
    return cachedEnsName || "";
  }
}
