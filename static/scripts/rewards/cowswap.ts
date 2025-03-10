import { OrderBookApi, SupportedChainId, OrderQuoteSideKindSell, TradingSdk, TradeParameters, OrderKind } from "@cowprotocol/cow-sdk";
import { app } from "./app-state";
import { BigNumberish, ethers } from "ethers";
import { JsonRpcSigner } from "@ethersproject/providers";
import { errorToast, MetaMaskError, toaster } from "./toaster";

const networkToChainId: { [key: number]: SupportedChainId } = {
  1: SupportedChainId.MAINNET,
  100: SupportedChainId.GNOSIS_CHAIN,
  42161: SupportedChainId.ARBITRUM_ONE,
  8453: SupportedChainId.BASE,
};

export async function quoteAmount(
  originalTokenAddress: string,
  originalAmount: BigNumberish,
  targetTokenAddress: string | null,
  chainId: number
): Promise<BigNumberish> {
  if (!targetTokenAddress || targetTokenAddress.toLowerCase() === originalTokenAddress.toLowerCase()) {
    return originalAmount;
  }

  const supportedChainId = networkToChainId[chainId];
  if (!supportedChainId) {
    console.error(`Unsupported chainId: ${chainId}`);
    return originalAmount;
  }

  try {
    const orderBookApi = new OrderBookApi({ chainId: supportedChainId });

    const quote = await orderBookApi.getQuote({
      sellToken: originalTokenAddress,
      buyToken: targetTokenAddress,
      from: app.reward.owner,
      receiver: app.reward.beneficiary,
      kind: OrderQuoteSideKindSell.SELL,
      sellAmountAfterFee: originalAmount.toString(),
    });

    console.log("Quote from CoW Swap:", quote);
    if (!quote?.quote?.buyAmount) {
      console.error("Failed to fetch quote: No buyAmount returned");
      return originalAmount;
    }

    return ethers.BigNumber.from(quote.quote.buyAmount);
  } catch (error) {
    console.error("Error fetching quote from CoW Swap:", error);
    return originalAmount;
  }
}

export async function swapTokens({
  signer,
  sellToken,
  sellTokenDecimals,
  buyToken,
  buyTokenDecimals,
  sellAmount,
  chainId,
}: {
  signer: JsonRpcSigner;
  sellToken: string;
  sellTokenDecimals: number;
  buyToken: string;
  buyTokenDecimals: number;
  sellAmount: BigNumberish;
  chainId: number;
}): Promise<string | null> {
  const supportedChainId = networkToChainId[chainId];
  if (!supportedChainId) {
    console.error(`Unsupported chainId: ${chainId}`);
    toaster.create("error", "Unsupported network for swapping.");
    return null;
  }

  try {
    const sdk = new TradingSdk({
      chainId: supportedChainId,
      signer,
      appCode: "YourAppCode", // todo: replace with app code
    });

    const parameters: TradeParameters = {
      kind: OrderKind.SELL,
      sellToken: sellToken.toLowerCase(),
      sellTokenDecimals,
      buyToken: buyToken.toLowerCase(),
      buyTokenDecimals,
      amount: sellAmount.toString(),
    };

    const orderId = await sdk.postSwapOrder(parameters);

    if (!orderId) {
      throw new Error("Failed to submit order: No orderId returned");
    }

    toaster.create("success", "Swap order submitted successfully!");
    return orderId;
  } catch (error) {
    console.error("Error executing swap via CoW SDK:", error);
    if (error instanceof Error) {
      const metaMaskError = error as unknown as MetaMaskError;
      errorToast(metaMaskError, `Failed to execute swap: ${metaMaskError}`);
    }
    return null;
  }
}
