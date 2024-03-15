import { RPCHandler } from "@keyrxng/rpc-handler/dist/esm/src/rpc-handler";
import { HandlerConstructorConfig } from "@keyrxng/rpc-handler/dist/esm/src";
import { AppState } from "../app-state";

export async function useRpcHandler(app: AppState) {
  const config: HandlerConstructorConfig = {
    networkId: app.networkId ?? app.reward.networkId,
    autoStorage: true,
    cacheRefreshCycles: 10,
  };

  const handler = new RPCHandler(config);

  await handler.getFastestRpcProvider();

  return handler;
}
