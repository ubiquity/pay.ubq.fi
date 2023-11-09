export const makeResponseFunc = (origin: string) => ({
  makeResponse: _makeResponse(origin),
  makeRpcResponse: _makeRpcResponse(origin),
});

const _makeResponse =
  (origin: string) =>
  (
    body?: BodyInit | null,
    status?: number,
    headers?: Record<string, any>,
    bypassStringify?: boolean
  ) => {


    return new Response(
      typeof body === "string" && !bypassStringify
        ? JSON.stringify({ message: body })
        : body,
      {
        status,
        headers: {
          ...(headers || {}),
        },
      }
    );
  };

const _makeRpcResponse =
  (origin: string) =>
  (body: object, id: string | number | null = null, status?: number) => {
    return _makeResponse(origin)(
      JSON.stringify({ jsonrpc: "2.0", ...body, id }),
      status,
      undefined,
      true
    );
  };
