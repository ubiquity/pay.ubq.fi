import { isAddress, type Address, type WalletClient } from "viem";
import { getTokenInfo } from "../constants/supported-reward-tokens.ts";

export interface CowSwapQuoteParams {
  tokenIn: Address;
  tokenOut: Address;
  amountIn: bigint;
  userAddress: Address;
  chainId: number;
  signal?: AbortSignal;
}

export interface CowSwapOrderQuote {
  sellToken: Address;
  buyToken: Address;
  receiver: Address;
  sellAmount: string;
  buyAmount: string;
  appData: `0x${string}`;
  feeAmount: string;
  validTo: number;
  kind: "sell" | "buy";
  partiallyFillable: boolean;
  sellTokenBalance: "erc20" | "internal" | "external";
  buyTokenBalance: "erc20" | "internal" | "external";
}

export interface CowSwapQuoteResult {
  estimatedAmountOut: bigint;
  feeAmount: bigint;
  validTo: number;
  /** Raw amounts are retained for display/debugging; this helper never signs or posts an order. */
  amountsAndCosts: {
    beforeNetworkCosts: { sellAmount: string; buyAmount: string };
    afterNetworkCosts: { sellAmount: string; buyAmount: string };
  };
  order: CowSwapOrderQuote;
  quoteId?: number;
}

export function isSupportedCowSettlementToken(chainId: number, tokenAddress: Address): boolean {
  return chainId === 100 && getTokenInfo(chainId, tokenAddress)?.symbol === "UUSD";
}

export const COW_ORDER_TYPES = {
  Order: [
    { name: "sellToken", type: "address" },
    { name: "buyToken", type: "address" },
    { name: "receiver", type: "address" },
    { name: "sellAmount", type: "uint256" },
    { name: "buyAmount", type: "uint256" },
    { name: "validTo", type: "uint32" },
    { name: "appData", type: "bytes32" },
    { name: "feeAmount", type: "uint256" },
    { name: "kind", type: "string" },
    { name: "partiallyFillable", type: "bool" },
    { name: "sellTokenBalance", type: "string" },
    { name: "buyTokenBalance", type: "string" },
  ],
} as const;

const COW_ORDER_DOMAIN_NAME = "Gnosis Protocol";
const COW_ORDER_DOMAIN_VERSION = "v2";
const COW_SETTLEMENT_ADDRESS: Address = "0x9008D19f58AAbD9eD0D60971565AA8510560ab41";

const COW_NETWORK_BY_CHAIN: Record<number, string> = {
  1: "mainnet",
  // CoW Protocol's production API uses `xdai` for chain id 100.
  100: "xdai",
  8453: "base",
  42161: "arbitrum_one",
};

const QUOTE_TIMEOUT_MS = 10_000;

function quoteUrl(chainId: number): string {
  const network = COW_NETWORK_BY_CHAIN[chainId];
  if (!network) throw new Error(`CoW quotes are not supported on chain ${chainId}`);
  return `https://api.cow.fi/${network}/api/v1/quote`;
}

function parsePositiveInteger(value: unknown, field: string): bigint {
  if (typeof value !== "string" || !/^\d+$/.test(value)) {
    throw new Error(`CoW quote returned an invalid ${field}`);
  }
  const parsed = BigInt(value);
  if (parsed <= 0n) throw new Error(`CoW quote returned a non-positive ${field}`);
  return parsed;
}

function parseQuote(value: unknown, expectedReceiver: Address): CowSwapOrderQuote {
  if (!value || typeof value !== "object") throw new Error("CoW quote response was malformed");
  const quote = value as Partial<CowSwapOrderQuote>;
  const sellToken = typeof quote.sellToken === "string" ? quote.sellToken : "";
  const buyToken = typeof quote.buyToken === "string" ? quote.buyToken : "";
  const receiver = typeof quote.receiver === "string" ? quote.receiver : "";
  if (!isAddress(sellToken) || !isAddress(buyToken)) throw new Error("CoW quote returned invalid token addresses");
  if (!isAddress(receiver) || receiver.toLowerCase() !== expectedReceiver.toLowerCase()) {
    throw new Error("CoW quote returned an unexpected receiver");
  }
  const sellAmount = typeof quote.sellAmount === "string" ? quote.sellAmount : "";
  const buyAmount = typeof quote.buyAmount === "string" ? quote.buyAmount : "";
  const feeAmount = typeof quote.feeAmount === "string" ? quote.feeAmount : "";
  const appData = typeof quote.appData === "string" ? quote.appData : "";
  parsePositiveInteger(sellAmount, "sell amount");
  parsePositiveInteger(buyAmount, "buy amount");
  if (!/^\d+$/.test(feeAmount) || BigInt(feeAmount) < 0n) throw new Error("CoW quote returned an invalid fee amount");
  if (!/^0x[0-9a-fA-F]{64}$/.test(appData)) throw new Error("CoW quote returned invalid app data");
  const validTo = quote.validTo;
  if (typeof validTo !== "number" || !Number.isSafeInteger(validTo) || validTo <= 0) throw new Error("CoW quote returned an invalid expiry");
  const kind = quote.kind;
  if (kind !== "sell" && kind !== "buy") throw new Error("CoW quote returned an invalid order kind");
  const partiallyFillable = quote.partiallyFillable;
  if (typeof partiallyFillable !== "boolean") throw new Error("CoW quote returned an invalid fill mode");
  const sellTokenBalance = quote.sellTokenBalance;
  const buyTokenBalance = quote.buyTokenBalance;
  if (!isBalanceSource(sellTokenBalance) || !isBalanceSource(buyTokenBalance)) {
    throw new Error("CoW quote returned an invalid balance source");
  }
  return {
    sellToken: sellToken as Address,
    buyToken: buyToken as Address,
    receiver: receiver as Address,
    sellAmount,
    buyAmount,
    appData: appData as `0x${string}`,
    feeAmount,
    validTo,
    kind,
    partiallyFillable,
    sellTokenBalance,
    buyTokenBalance,
  };
}

function isBalanceSource(value: unknown): value is CowSwapOrderQuote["sellTokenBalance"] {
  return value === "erc20" || value === "internal" || value === "external";
}

function syntheticOrder(params: CowSwapQuoteParams): CowSwapOrderQuote {
  return {
    sellToken: params.tokenIn,
    buyToken: params.tokenOut,
    receiver: params.userAddress,
    sellAmount: params.amountIn.toString(),
    buyAmount: params.amountIn.toString(),
    appData: "0x0000000000000000000000000000000000000000000000000000000000000000",
    feeAmount: "0",
    validTo: Math.floor(Date.now() / 1000) + 60,
    kind: "sell",
    partiallyFillable: false,
    sellTokenBalance: "erc20",
    buyTokenBalance: "erc20",
  };
}

export function getCowSwapOrderDomain(chainId: number) {
  if (!COW_NETWORK_BY_CHAIN[chainId]) throw new Error(`CoW orders are not supported on chain ${chainId}`);
  return {
    name: COW_ORDER_DOMAIN_NAME,
    version: COW_ORDER_DOMAIN_VERSION,
    chainId,
    verifyingContract: COW_SETTLEMENT_ADDRESS,
  } as const;
}

export function getCowSwapOrderMessage(order: CowSwapOrderQuote) {
  return {
    sellToken: order.sellToken,
    buyToken: order.buyToken,
    receiver: order.receiver,
    sellAmount: BigInt(order.sellAmount),
    buyAmount: BigInt(order.buyAmount),
    validTo: order.validTo,
    appData: order.appData,
    feeAmount: BigInt(order.feeAmount),
    kind: order.kind,
    partiallyFillable: order.partiallyFillable,
    sellTokenBalance: order.sellTokenBalance,
    buyTokenBalance: order.buyTokenBalance,
  } as const;
}

export interface CowSwapOrderSubmission {
  order: CowSwapOrderQuote;
  from: Address;
  signature: `0x${string}`;
  quoteId?: number;
}

export async function signCowSwapOrder({
  walletClient,
  account,
  chainId,
  order,
}: {
  walletClient: Pick<WalletClient, "signTypedData">;
  account: Address;
  chainId: number;
  order: CowSwapOrderQuote;
}): Promise<`0x${string}`> {
  return walletClient.signTypedData({
    account,
    domain: getCowSwapOrderDomain(chainId),
    types: COW_ORDER_TYPES,
    primaryType: "Order",
    message: getCowSwapOrderMessage(order),
  });
}

/** Submit an already signed order; signing remains a separate explicit wallet action. */
export async function submitCowSwapOrderForChain(chainId: number, submission: CowSwapOrderSubmission): Promise<string> {
  const network = COW_NETWORK_BY_CHAIN[chainId];
  if (!network) throw new Error(`CoW orders are not supported on chain ${chainId}`);
  const response = await fetch(`https://api.cow.fi/${network}/api/v1/orders`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({
      ...submission.order,
      from: submission.from,
      signature: submission.signature,
      signingScheme: "eip712",
      quoteId: submission.quoteId ?? null,
    }),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`CoW order submission failed: HTTP ${response.status}${detail ? ` (${detail.slice(0, 200)})` : ""}`);
  }
  const orderUid = await response.text();
  if (!/^0x[0-9a-fA-F]{112}$/.test(orderUid.trim())) throw new Error("CoW order response contained an invalid UID");
  return orderUid.trim();
}

/**
 * Fetches a short-lived CoW Protocol quote for display only.
 *
 * The endpoint is allow-listed by chain and token metadata is checked before
 * the request. No wallet signing, permit invalidation, or order submission is
 * performed here; those actions must remain an explicit user-facing flow.
 */
export async function getCowSwapQuote(params: CowSwapQuoteParams): Promise<CowSwapQuoteResult> {
  if (!params.chainId || !COW_NETWORK_BY_CHAIN[params.chainId]) {
    throw new Error(`CoW quotes are not supported on chain ${params.chainId}`);
  }
  if (!isAddress(params.tokenIn) || !isAddress(params.tokenOut) || !isAddress(params.userAddress)) {
    throw new Error("A valid wallet and token address are required for a CoW quote");
  }
  if (params.amountIn <= 0n) throw new Error("Quote amount must be positive");

  const tokenInInfo = getTokenInfo(params.chainId, params.tokenIn);
  const tokenOutInfo = getTokenInfo(params.chainId, params.tokenOut);
  if (!tokenInInfo || !tokenOutInfo) {
    throw new Error(`Cannot find supported tokens on chain ${params.chainId}`);
  }
  if (params.tokenIn.toLowerCase() === params.tokenOut.toLowerCase()) {
    const order = syntheticOrder(params);
    return {
      estimatedAmountOut: params.amountIn,
      feeAmount: 0n,
      validTo: order.validTo,
      amountsAndCosts: {
        beforeNetworkCosts: { sellAmount: params.amountIn.toString(), buyAmount: params.amountIn.toString() },
        afterNetworkCosts: { sellAmount: params.amountIn.toString(), buyAmount: params.amountIn.toString() },
      },
      order,
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), QUOTE_TIMEOUT_MS);
  const abortHandler = () => controller.abort();
  if (params.signal) {
    if (params.signal.aborted) controller.abort();
    else params.signal.addEventListener("abort", abortHandler, { once: true });
  }
  try {
    const response = await fetch(quoteUrl(params.chainId), {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({
        sellToken: params.tokenIn,
        buyToken: params.tokenOut,
        sellAmountBeforeFee: params.amountIn.toString(),
        kind: "sell",
        from: params.userAddress,
        receiver: params.userAddress,
        priceQuality: "fast",
      }),
      signal: controller.signal,
    });
    if (!response.ok) {
      const errorPayload = (await response.json().catch(() => null)) as { errorType?: unknown } | null;
      const errorType = typeof errorPayload?.errorType === "string" ? errorPayload.errorType : `HTTP ${response.status}`;
      throw new Error(`CoW quote unavailable: ${errorType}`);
    }
    const payload = (await response.json()) as { quote?: unknown };
    const quote = parseQuote(payload.quote, params.userAddress);
    if (quote.sellToken.toLowerCase() !== params.tokenIn.toLowerCase() || quote.buyToken.toLowerCase() !== params.tokenOut.toLowerCase()) {
      throw new Error("CoW quote token pair did not match the request");
    }
    return {
      estimatedAmountOut: BigInt(quote.buyAmount),
      feeAmount: BigInt(quote.feeAmount),
      validTo: quote.validTo,
      amountsAndCosts: {
        beforeNetworkCosts: { sellAmount: params.amountIn.toString(), buyAmount: quote.buyAmount },
        afterNetworkCosts: { sellAmount: quote.sellAmount, buyAmount: quote.buyAmount },
      },
      order: quote,
      quoteId: typeof (payload as { id?: unknown }).id === "number" ? (payload as { id: number }).id : undefined,
    };
  } finally {
    clearTimeout(timeout);
    params.signal?.removeEventListener("abort", abortHandler);
  }
}
