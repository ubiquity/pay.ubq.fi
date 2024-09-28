import { RPCHandler } from "@ubiquity-dao/rpc-handler";
import { Permit } from "@ubiquibot/permit-generation/types";

export function useHandler(networkId: number) {
  const config = {
    networkId: networkId,
    autoStorage: true,
    cacheRefreshCycles: 5,
    rpcTimeout: 1500,
    networkName: null,
    runtimeRpcs: null,
    networkRpcs: null,
  };

  // No RPCs are tested at this point
  return new RPCHandler(config);
}

export async function useRpcHandler(claim: Permit) {
  const networkId = claim.networkId;
  if (!networkId) {
    throw new Error("Network ID not set");
  }

  const handler = useHandler(networkId);
  const provider = await handler.getFastestRpcProvider();
  const url = provider.connection.url;
  if (!url) {
    throw new Error("Provider URL not set");
  }
  return provider;
}
