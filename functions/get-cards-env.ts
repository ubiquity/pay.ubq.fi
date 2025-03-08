import { Context } from "./utils/types";

export async function onRequest(ctx: Context): Promise<Response> {
  return Response.json({ USE_RELOADLY_SANDBOX: ctx.env.USE_RELOADLY_SANDBOX }, { status: 200 });
}
