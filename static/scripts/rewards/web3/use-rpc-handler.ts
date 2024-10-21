import { RPCHandler, HandlerConstructorConfig, NetworkId } from "@ubiquity-dao/rpc-handler";

export function convertToNetworkId(networkId: number | string): NetworkId {
  if (typeof networkId === "string") {
    return networkId as NetworkId;
  }
  return String(networkId) as NetworkId;
}

export function useHandler(networkId: number) {
  const isDev = networkId === 31337;
  const config: HandlerConstructorConfig = {
    networkId: convertToNetworkId(networkId),
    autoStorage: true,
    cacheRefreshCycles: 5,
    rpcTimeout: 1500,
    networkName: null,
    runtimeRpcs: isDev ? ["http://localhost:8545"] : null,
    networkRpcs: isDev ? [{ url: "http://localhost:8545" }] : null,
    proxySettings: {
      logger: null,
      logTier: "error",
      retryCount: 3,
      retryDelay: 50,
      strictLogs: true, // Set to false to see all log tiers
    },
  };

  // No RPCs are tested at this point
  return new RPCHandler(config);
}

export async function useRpcHandler(networkId: number) {
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
