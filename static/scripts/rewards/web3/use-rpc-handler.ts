import { RPCHandler } from "@ubiquity-dao/rpc-handler";
import { AppState } from "../app-state";
import { ethers } from "ethers";

async function useHandler(networkId: number) {
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

export async function useRpcHandler(app: AppState) {
  const networkId = app.networkId;
  if (!networkId) {
    throw new Error("Network ID not set");
  }

  const handler = await useHandler(networkId);
  const provider = await handler.getFastestRpcProvider();
  const url = provider.connection.url;
  if (!url) {
    throw new Error("Provider URL not set");
  }
  return new ethers.providers.JsonRpcProvider(provider.connection.url);
}
