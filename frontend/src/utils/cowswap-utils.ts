import { OrderKind, getQuote } from '@cowprotocol/cow-sdk'; // Import getQuote directly
import { Address, WalletClient, formatUnits } from 'viem';
import { getTokenInfo } from '../constants/supported-reward-tokens';

// Use Gnosis Chain ID directly
const GNOSIS_CHAIN_ID = 100;

// No SDK instantiation needed if using exported functions directly

interface CowSwapQuoteParams {
  tokenIn: Address;
  tokenOut: Address;
  amountIn: bigint; // Amount in input token's smallest unit (e.g., wei for 18 decimals)
  userAddress: Address; // Needed for quote context
  chainId: number; // Need chainId to get token decimals
}

import { QuoteAmountsAndCosts } from '@cowprotocol/cow-sdk'; // Import QuoteAmountsAndCosts type

interface CowSwapQuoteResult {
  estimatedAmountOut: bigint; // Final estimated amount after fees/slippage
  feeAmount?: bigint; // Network fee amount
  // Use the default generic type for amountsAndCosts, which should resolve to bigints based on SDK usage
  amountsAndCosts: QuoteAmountsAndCosts;
}

interface InitiateCowSwapParams extends CowSwapQuoteParams { // Fix typo: CowSwapParams -> CowSwapQuoteParams
  walletClient: WalletClient; // Requires a connected wallet client for signing
}

/**
 * Fetches a quote from the CowSwap API for a potential swap.
 * Does not require signing or submit an order.
 */
export async function getCowSwapQuote(params: CowSwapQuoteParams): Promise<CowSwapQuoteResult> {
  // console.log('Fetching CowSwap quote:', params);
  try {
    // Ensure chainId matches SDK instance if necessary (CowSdk constructor already sets it)
    if (params.chainId !== GNOSIS_CHAIN_ID) {
      throw new Error(`Chain ID mismatch: SDK is for ${GNOSIS_CHAIN_ID}, params specify ${params.chainId}`);
    }

    // Fetch token decimals
    const tokenInInfo = getTokenInfo(params.chainId, params.tokenIn);
    const tokenOutInfo = getTokenInfo(params.chainId, params.tokenOut);

    if (!tokenInInfo || !tokenOutInfo) {
      throw new Error(`Cannot find token info for ${params.tokenIn} or ${params.tokenOut} on chain ${params.chainId}`);
    }

    // Construct TradeParameters object
    const tradeParameters = {
      kind: OrderKind.SELL,
      sellToken: params.tokenIn,
      sellTokenDecimals: tokenInInfo.decimals,
      buyToken: params.tokenOut,
      buyTokenDecimals: tokenOutInfo.decimals,
      amount: params.amountIn.toString(), // Amount is the sell amount for OrderKind.SELL
      receiver: params.userAddress, // Optional: defaults to userAddress if not provided? Check SDK docs.
      // validFor: 600, // Optional: validity in seconds (e.g., 10 minutes)
      // slippageBps: 50, // Optional: 0.5% slippage tolerance
      // Explicitly set partnerFee to zero
      partnerFee: {
        bps: 0,
        recipient: '0x0000000000000000000000000000000000000000',
      },
    };

    // Construct QuoterParameters object
    const quoterParameters = {
      chainId: GNOSIS_CHAIN_ID,
      appCode: 'UbiquityPay', // Provide an app code
      account: params.userAddress,
    };

    // console.log('Calling CowSwap getQuote with:', tradeParameters, quoterParameters);
    const quoteResponse = await getQuote(tradeParameters, quoterParameters);
    // console.log('CowSwap Quote Response:', quoteResponse);

    // Parse the response from result.amountsAndCosts
    const amountsAndCosts = quoteResponse.result?.amountsAndCosts;
    if (!amountsAndCosts || !amountsAndCosts.afterPartnerFees || !amountsAndCosts.afterPartnerFees.buyAmount) {
      throw new Error('Invalid quote response structure received from CowSwap API. Expected result.amountsAndCosts.afterPartnerFees.buyAmount.');
    }

    // Use afterPartnerFees.buyAmount for the primary estimated output
    const estimatedAmountOut = BigInt(amountsAndCosts.afterPartnerFees.buyAmount);
    // Use network fee in sell currency as the representative fee amount
    const feeAmount = amountsAndCosts.costs?.networkFee?.amountInSellCurrency
      ? BigInt(amountsAndCosts.costs.networkFee.amountInSellCurrency)
      : undefined;

    // console.log(`Actual Quote: In: ${params.amountIn}, Out (afterPartnerFees): ${estimatedAmountOut}, Fee (network): ${feeAmount ?? 'N/A'}`);
    // console.log('Full amountsAndCosts:', amountsAndCosts); // Log the full object

    // Return the final amount, fee, and the full breakdown object
    return {
      estimatedAmountOut,
      feeAmount,
      amountsAndCosts: amountsAndCosts, // Return the object directly without casting
    };
  } catch (error) {
    console.error('Error fetching CowSwap quote:', error);
    // Cannot access tokenInfo here, use params directly for error message
    throw new Error(`Failed to get CowSwap quote for token ${params.tokenIn} -> ${params.tokenOut}. Error: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Initiates a CowSwap order by fetching quote/order params,
 * requesting user signature, and submitting to the API.
 */
export async function initiateCowSwap(params: InitiateCowSwapParams): Promise<{ orderUid: string }> {
  // console.log('Initiating CowSwap order (placeholder):', params);
  if (!params.walletClient.account) {
    throw new Error('Wallet client account is not available for signing.');
  }
  // Add chainId check if needed by SDK methods below
  if (!params.chainId) {
     throw new Error('Chain ID is required to initiate swap.');
  }
  const signerAddress = params.walletClient.account.address;

  try {
    // TODO: Implement actual order creation and submission logic using cowSdk
    // 1. Get Order Parameters (similar to getQuote but might need more details)
    const orderConfigRequest = {
      sellToken: params.tokenIn,
      buyToken: params.tokenOut,
      sellAmountBeforeFee: params.amountIn.toString(),
      kind: OrderKind.SELL,
      from: signerAddress, // Signer must be the 'from' address
      receiver: signerAddress, // Usually swap back to self
      // Set a valid timestamp (e.g., 30 minutes from now)
      validTo: Math.floor(Date.now() / 1000) + 1800,
      // Add other necessary parameters like appData, feeAmount (if required)
    };
    // const orderConfig = await cowSdk.cowApi.getOrderConfig(orderConfigRequest); // Or similar method

    // --- Placeholder ---
    const orderConfig = { // Replace with actual config from SDK
        sellToken: params.tokenIn,
        buyToken: params.tokenOut,
        receiver: signerAddress,
        sellAmount: params.amountIn.toString(),
        buyAmount: (params.amountIn - params.amountIn / 1000n).toString(), // Use placeholder estimate
        validTo: Math.floor(Date.now() / 1000) + 1800,
        appData: '0x...', // Placeholder AppData hash
        feeAmount: '0', // Placeholder fee
        kind: OrderKind.SELL,
        partiallyFillable: false,
    };
     // --- End Placeholder ---


    // 2. Sign the Order
    // const signature = await cowSdk.signOrder(orderConfig, params.walletClient); // Check SDK method for signing with viem WalletClient

    // --- Placeholder ---
    const signature = '0xplaceholderSignature'; // Replace with actual signature
    // --- End Placeholder ---

    if (!signature) {
      throw new Error('Failed to sign CowSwap order.');
    }

    // 3. Submit the Signed Order
    // const orderUid = await cowSdk.cowApi.sendOrder({
    //   ...orderConfig, // Spread the configuration used for signing
    //   signature: signature,
    //   signingScheme: 'ethsign', // Or other scheme as required by SDK/wallet
    // });

    // --- Placeholder ---
    const orderUid = `0xplaceholderOrderUid-${Date.now()}`; // Replace with actual UID
    // --- End Placeholder ---


    if (!orderUid) {
      throw new Error('Failed to submit CowSwap order or retrieve Order UID.');
    }

    // console.log('CowSwap Order Submitted. UID:', orderUid);
    return { orderUid };

  } catch (error) {
    console.error('Error initiating CowSwap order:', error);
    // Provide a more specific error message if possible
    const message = error instanceof Error ? error.message : 'An unknown error occurred.';
    // Use token info for better error message formatting
    const tokenInInfo = getTokenInfo(params.chainId, params.tokenIn);
    const tokenOutInfo = getTokenInfo(params.chainId, params.tokenOut);
    const amountStr = tokenInInfo ? formatUnits(params.amountIn, tokenInInfo.decimals) : params.amountIn.toString();
    const inSymbol = tokenInInfo?.symbol || params.tokenIn;
    const outSymbol = tokenOutInfo?.symbol || params.tokenOut;

    throw new Error(`Failed to initiate CowSwap for ${amountStr} ${inSymbol} -> ${outSymbol}: ${message}`);
  }
}
