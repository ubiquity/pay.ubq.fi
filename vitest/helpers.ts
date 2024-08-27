import { env, createExecutionContext, Parameters } from "cloudflare:test";
import { Context } from "../functions/types";

export function createContext(baseUrl: string, params: Record<string, string>) {
  const url = new URL(baseUrl);
  url.search = new URLSearchParams(params).toString();
  const request = new Request(url);
  const ctx = createExecutionContext();
  const eventCtx: Parameters<(ctx: Context) => Promise<Response>>[0] = {
    request,
    functionPath: "",
    waitUntil: ctx.waitUntil.bind(ctx),
    passThroughOnException: ctx.passThroughOnException.bind(ctx),
    env,
  };
  return { request, ctx, eventCtx };
}

export const DEFAULT_BASE_URL = "http:/placeholder";
