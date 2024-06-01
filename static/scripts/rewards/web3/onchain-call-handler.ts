import { ethers } from "ethers";
import { AppState } from "../app-state";
import { JsonRpcProvider } from "@ethersproject/providers";
import { toaster } from "../toaster";

/**
 * Creates a proxy for the provider so that we can retry any failed provider call
 * across the app.
 *
 * Should a call fail it will retry the call starting with the fastest provider
 * until it has tried all providers.
 *
 * It will do this three times before throwing an error. It is more likely
 * it'll succeed on the first loop but we'll try three times to be sure.
 */

export function createProviderProxy(app: AppState, handler: RPCHandler): JsonRpcProvider {
  return new Proxy(app.provider, {
    get: function (target: JsonRpcProvider, prop: keyof JsonRpcProvider) {
      if (typeof target[prop] === "function") {
        return async function (...args: unknown[]) {
          // first attempt at the call, if it fails we don't care about the error
          try {
            return await (target[prop] as (...args: unknown[]) => Promise<unknown>)(...args);
          } catch {
            //
          }

          const latencies: Record<string, number> = await handler.getLatencies();
          const sortedLatencies = Object.entries(latencies).sort((a, b) => a[1] - b[1]);

          let loops = 3;

          let lastError: Error | unknown | null = null;

          while (loops > 0) {
            for (const [rpc] of sortedLatencies) {
              console.log(`[PROXY] Connected to: ${rpc}`);
              try {
                // we do not want to change the app.provider as it is the proxy itself
                const newProvider = new ethers.providers.JsonRpcProvider(rpc.split("__")[1]);
                return await (newProvider[prop] as (...args: unknown[]) => Promise<unknown>)(...args);
              } catch (e) {
                console.error("[PROXY] Provider Error -> retrying with new provider");
                lastError = e;
              }
            }
            loops--;
          }

          toaster.create("error", "Operation failed to complete, see more in the console");

          if (lastError instanceof Error) {
            console.error(lastError);
          } else {
            console.error("Unknown error", lastError);
          }
        };
      }
      return target[prop];
    },
  });
}
