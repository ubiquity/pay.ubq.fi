import type { Address } from "viem";
import type { WalletClient } from "viem";
import {
  COW_PROTOCOL_VAULT_RELAYER_ADDRESS,
  OrderBookApi,
  OrderQuoteSideKindSell,
  OrderSigningUtils,
  SigningScheme,
  SupportedChainId,
  buildAppData,
  getQuoteAmountsAndCosts,
} from "@cowprotocol/cow-sdk";
import type { QuoteAmountsAndCosts } from "@cowprotocol/cow-sdk";
import { COWSWAP_PARTNER_FEE_BPS, COWSWAP_PARTNER_FEE_RECIPIENT } from "../constants/config.ts";
import { getTokenInfo } from "../constants/supported-reward-tokens.ts";

interface CowSwapQuoteParams {
  tokenIn: Address;
  tokenOut: Address;
  amountIn: bigint;
  userAddress: Address;
  chainId: number;
}

interface CowSwapQuoteResult {
  estimatedAmountOut: bigint;
  feeAmount?: bigint;
  amountsAndCosts: QuoteAmountsAndCosts;
}

interface CowSwapOrderParams {
  tokenIn: Address;
  tokenOut: Address;
  amountIn: bigint;
  owner: Address;
  receiver: Address;
  chainId: number;
  walletClient: WalletClient;
}

const DEFAULT_SLIPPAGE_BPS = 50; // 0.5%

function buildCowQuoteRequest({
  tokenIn,
  tokenOut,
  from,
  receiver,
  amountIn,
  appDataInfo,
}: {
  tokenIn: Address;
  tokenOut: Address;
  from: Address;
  receiver: Address;
  amountIn: bigint;
  appDataInfo: { fullAppData: string; appDataKeccak256: string };
}) {
  return {
    sellToken: tokenIn,
    buyToken: tokenOut,
    from,
    receiver,
    sellAmountBeforeFee: amountIn.toString(),
    kind: OrderQuoteSideKindSell.SELL,
    appData: appDataInfo.fullAppData,
    appDataHash: appDataInfo.appDataKeccak256,
  };
}

function assertQuoteShape(quote: Record<string, unknown>) {
  // Runtime guard before using the quote in an EIP-712 signature.
  // Keep in sync with `OrderSigningUtils.getEIP712Types().Order`.
  const eip712Types = OrderSigningUtils.getEIP712Types() as unknown as { Order: Array<{ name: string; type: string }> };
  const required = eip712Types.Order.map((t) => t.name);
  for (const key of required) {
    if (!(key in quote)) throw new Error(`CoW quote missing required field: ${key}`);
  }
}

/**
 * CoW SDK expects a specific chain id enum type. Validate at runtime to avoid silently targeting the wrong endpoint.
 */
function asSupportedChainId(chainId: number): SupportedChainId {
  const supported = Object.values(SupportedChainId).filter((v): v is number => typeof v === "number");
  if (!supported.includes(chainId)) {
    throw new Error(`Unsupported CoW Protocol chainId: ${chainId}`);
  }
  return chainId as SupportedChainId;
}

/**
 * Returns CoW Protocol vault relayer address for a given chain.
 * This is the spender that must be approved for ERC20 sell tokens.
 */
export function getCowSwapVaultRelayerAddress(chainId: number): Address {
  const addr = (COW_PROTOCOL_VAULT_RELAYER_ADDRESS as Record<number, Address>)[chainId];
  if (!addr) throw new Error(`Unsupported chainId for CoW vault relayer: ${chainId}`);
  return addr;
}

/**
 * Returns partner fee bps for a given chain and output token (if applicable).
 * Partner fee is disabled for UUSD output to avoid reducing the settlement token.
 */
function getPartnerFeeBps(chainId: number, tokenOut: Address): number | undefined {
  const info = getTokenInfo(chainId, tokenOut);
  if (!info) return undefined;
  // Apply partner fee to all swaps where the output token is NOT UUSD.
  return info.symbol.toUpperCase() === "UUSD" ? undefined : COWSWAP_PARTNER_FEE_BPS;
}

async function buildCowAppDataInfo(partnerFeeBps: number | undefined) {
  return await buildAppData({
    slippageBps: DEFAULT_SLIPPAGE_BPS,
    appCode: "pay.ubq.fi",
    orderClass: "market",
    ...(partnerFeeBps !== undefined
      ? { partnerFee: { bps: partnerFeeBps, recipient: COWSWAP_PARTNER_FEE_RECIPIENT } }
      : {}),
  });
}

/**
 * Fetches a quote from the CowSwap API for a potential swap.
 * Does not require signing or submit an order.
 */
export async function getCowSwapQuote(params: CowSwapQuoteParams): Promise<CowSwapQuoteResult> {
  if (!params.chainId) {
    throw new Error("Chain ID is required to get CowSwap quote.");
  }

  const tokenInInfo = getTokenInfo(params.chainId, params.tokenIn);
  const tokenOutInfo = getTokenInfo(params.chainId, params.tokenOut);

  if (!tokenInInfo || !tokenOutInfo) {
    throw new Error(`Cannot find token info for ${params.tokenIn} or ${params.tokenOut} on chain ${params.chainId}`);
  }

  const partnerFeeBps = getPartnerFeeBps(params.chainId, params.tokenOut);
  const appDataInfo = await buildCowAppDataInfo(partnerFeeBps);

  const chainId = asSupportedChainId(params.chainId);
  const orderBookApi = new OrderBookApi({ chainId });
  const quoteResponse = await orderBookApi.getQuote(
    buildCowQuoteRequest({
      tokenIn: params.tokenIn,
      tokenOut: params.tokenOut,
      from: params.userAddress,
      receiver: params.userAddress,
      amountIn: params.amountIn,
      appDataInfo,
    })
  );

  const amountsAndCosts = getQuoteAmountsAndCosts({
    orderParams: quoteResponse.quote,
    sellDecimals: tokenInInfo.decimals,
    buyDecimals: tokenOutInfo.decimals,
    slippagePercentBps: DEFAULT_SLIPPAGE_BPS,
    partnerFeeBps,
  });

  return {
    estimatedAmountOut: amountsAndCosts.afterSlippage.buyAmount,
    feeAmount: BigInt(quoteResponse.quote.feeAmount),
    amountsAndCosts,
  };
}

/**
 * Post a CoW swap order for `amountIn` of `tokenIn` -> `tokenOut`.
 *
 * Notes:
 * - This only posts the order; settlement depends on liquidity and the owner's token allowance to the CoW vault relayer.
 * - Caller should ensure allowance is sufficient before calling, otherwise the quote/order may fail or remain unfillable.
 */
export async function postCowSwapOrder(params: CowSwapOrderParams): Promise<{ orderId: string }> {
  const tokenInInfo = getTokenInfo(params.chainId, params.tokenIn);
  const tokenOutInfo = getTokenInfo(params.chainId, params.tokenOut);

  if (!tokenInInfo || !tokenOutInfo) {
    throw new Error(`Cannot find token info for ${params.tokenIn} or ${params.tokenOut} on chain ${params.chainId}`);
  }

  const partnerFeeBps = getPartnerFeeBps(params.chainId, params.tokenOut);
  const appDataInfo = await buildCowAppDataInfo(partnerFeeBps);

  const chainId = asSupportedChainId(params.chainId);
  const orderBookApi = new OrderBookApi({ chainId });
  const quoteResponse = await orderBookApi.getQuote(
    buildCowQuoteRequest({
      tokenIn: params.tokenIn,
      tokenOut: params.tokenOut,
      from: params.owner,
      receiver: params.receiver,
      amountIn: params.amountIn,
      appDataInfo,
    })
  );

  const rawDomain = await OrderSigningUtils.getDomain(chainId);
  const domain = {
    name: rawDomain.name,
    version: rawDomain.version,
    chainId,
    verifyingContract: rawDomain.verifyingContract as Address,
  };
  const types = OrderSigningUtils.getEIP712Types() as unknown as Record<string, Array<{ name: string; type: string }>>;

  const quote = quoteResponse.quote as unknown as Record<string, unknown>;
  assertQuoteShape(quote);

  // Build the message explicitly from the EIP-712 Order fields to avoid leaking extra fields into the signature.
  const orderFields = (types.Order ?? []).map((t) => t.name);
  const message = Object.fromEntries(orderFields.map((name) => [name, quote[name]])) as Record<string, unknown>;
  const signature = await params.walletClient.signTypedData({
    account: params.owner,
    domain,
    primaryType: "Order",
    types,
    message,
  });

  // Send order with explicit fields to avoid passing unexpected keys to the API.
  type SendOrderParams = Parameters<OrderBookApi["sendOrder"]>[0];

  // If we provide appDataHash alongside appData, CoW requires appData to be the JSON string.
  // Ensure the hash we built from appDataInfo matches the hash that we signed over.
  const signedAppData = (message as Record<string, unknown>)["appData"];
  if (typeof signedAppData === "string" && signedAppData.toLowerCase() !== appDataInfo.appDataKeccak256.toLowerCase()) {
    throw new Error("CoW appData hash mismatch between quote/signature and appDataInfo");
  }

  const orderId = await orderBookApi.sendOrder({
    ...message,
    from: params.owner,
    quoteId: quoteResponse.id ?? null,
    signature,
    signingScheme: SigningScheme.EIP712,
    appData: appDataInfo.fullAppData,
    appDataHash: appDataInfo.appDataKeccak256,
  } as unknown as SendOrderParams);

  return { orderId };
}
