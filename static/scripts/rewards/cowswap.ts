import { OrderBookApi, SupportedChainId, OrderQuoteSideKindSell } from "@cowprotocol/cow-sdk";
import { app } from "./app-state";
import { BigNumberish, ethers } from "ethers";

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
