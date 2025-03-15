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
): Promise<{ tokenAddress: string; amount: BigNumberish; isCowswapDown: boolean }> {
  if (!targetTokenAddress || targetTokenAddress.toLowerCase() === originalTokenAddress.toLowerCase()) {
    return { tokenAddress: originalTokenAddress, amount: originalAmount, isCowswapDown: false };
  }

  const supportedChainId = networkToChainId[chainId];
  if (!supportedChainId) {
    console.error(`Unsupported chainId: ${chainId}`);
    toaster.create("error", "CowSwap doesn't support this network - normal claim enabled.");
    return { tokenAddress: originalTokenAddress, amount: originalAmount, isCowswapDown: false };
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
      toaster.create("error", "CowSwap is down - normal claim enabled");
      return { tokenAddress: originalTokenAddress, amount: originalAmount, isCowswapDown: true };
    }

    return { tokenAddress: targetTokenAddress, amount: ethers.BigNumber.from(quote.quote.buyAmount), isCowswapDown: false };
  } catch (error) {
    console.error("Error fetching quote from CoW Swap:", error);
    toaster.create("error", "CowSwap is down - normal claim enabled");
    return { tokenAddress: originalTokenAddress, amount: originalAmount, isCowswapDown: true };
  }
}

export async function swapTokens({
  signer,
  sellTokenAddress,
  sellTokenDecimals,
  buyTokenAddress,
  buyTokenDecimals,
  sellAmount,
  chainId,
}: {
  signer: JsonRpcSigner;
  sellTokenAddress: string;
  sellTokenDecimals: number;
  buyTokenAddress: string;
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
      appCode: "ubiquity-dao", // arbitrary https://docs.cow.fi/cow-protocol/tutorials/widget#app-key
    });

    const parameters: TradeParameters = {
      kind: OrderKind.SELL,
      sellToken: sellTokenAddress.toLowerCase(),
      sellTokenDecimals,
      buyToken: buyTokenAddress.toLowerCase(),
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
