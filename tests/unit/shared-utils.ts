import { env } from "cloudflare:test";
import { Context } from "../../functions/utils/types";

export const TESTS_BASE_URL = "https://localhost";

export function createEventContext(request: Request, execContext: ExecutionContext, isSandbox: boolean = false) {
  const eventCtx: EventContext<typeof env, string, Record<string, unknown>> = {
    request: request as Request<unknown, IncomingRequestCfProperties<unknown>>,
    functionPath: "",
    waitUntil: execContext.waitUntil.bind(execContext),
    passThroughOnException: execContext.passThroughOnException.bind(execContext),
    async next() {
      return new Response();
    },
    env: {
      ...Object.assign({}, env, { USE_RELOADLY_SANDBOX: isSandbox ? "true" : "false" }),
      ASSETS: {
        fetch,
      },
    },
    params: {},
    data: {},
  };
  return eventCtx as Context;
}
