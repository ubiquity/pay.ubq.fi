import { RPCHandler, HandlerConstructorConfig } from "@keyrxng/rpc-handler";
import { AppState } from "../app-state";

export async function useRpcHandler(app: AppState) {
  const networkId = app.networkId;
  if (!networkId) {
    throw new Error("Network ID not set");
  }

  const config: HandlerConstructorConfig = {
    networkId,
    autoStorage: true,
    cacheRefreshCycles: 10,
  };

  const handler = new RPCHandler(config);

  await handler.testRpcPerformance();

  return handler;
}
