import { TransactionReceipt, TransactionResponse } from "@ethersproject/providers";
import { JsonRpcProvider } from "@ethersproject/providers/lib/json-rpc-provider";
import { Interface, TransactionDescription } from "ethers/lib/utils";
import { Tokens, chainIdToRewardTokenMap, giftCardTreasuryAddress, permit2Address } from "../shared/constants";
import { getFastestRpcUrl, getGiftCardOrderId, isGiftCardAvailable } from "../shared/helpers";
import { getGiftCardValue, isClaimableForAmount } from "../shared/pricing";
import { ExchangeRate, GiftCard, OrderRequestParams } from "../shared/types";
import { permit2Abi } from "../static/scripts/rewards/abis/permit2-abi";
import { getTransactionFromOrderId } from "./get-order";
import { allowedChainIds, commonHeaders, getAccessToken, getBaseUrl } from "./helpers";
import { AccessToken, Context, ReloadlyFailureResponse, ReloadlyOrderResponse } from "./types";
import { validateEnvVars, validateRequestMethod } from "./validators";

export async function onRequest(ctx: Context): Promise<Response> {
  try {
    validateRequestMethod(ctx.request.method, "POST");
    validateEnvVars(ctx);

    const accessToken = await getAccessToken(ctx.env);

    const { productId, txHash, chainId } = (await ctx.request.json()) as OrderRequestParams;

    if (isNaN(productId) || isNaN(chainId) || !(productId && txHash && chainId)) {
      throw new Error(`Invalid post parameters: ${JSON.stringify({ productId, txHash, chainId })}`);
    }

    if (!allowedChainIds.includes(chainId)) {
      throw new Error(`Unsupported chain: ${JSON.stringify({ chainId })}`);
    }

    const fastestRpcUrl = await getFastestRpcUrl(chainId);

    const provider = new JsonRpcProvider(
      {
        url: fastestRpcUrl,
        skipFetchSetup: true,
      },
      chainId
    );

    const [txReceipt, tx, giftCard]: [TransactionReceipt, TransactionResponse, GiftCard] = await Promise.all([
      provider.getTransactionReceipt(txHash),
      provider.getTransaction(txHash),
      getGiftCardById(productId, accessToken),
    ]);

    if (!txReceipt) {
      throw new Error(`Given transaction has not been mined yet. Please wait for it to be mined.`);
    }

    const iface = new Interface(permit2Abi);

    const txParsed = iface.parseTransaction({ data: tx.data });

    console.log("Parsed transaction data: ", JSON.stringify(txParsed));

    const errorResponse = validateTransaction(txParsed, txReceipt, chainId, giftCard);
    if (errorResponse) {
      return errorResponse;
    }

    const amountDaiWei = txParsed.args.transferDetails.requestedAmount;

    let exchangeRate = 1;
    if (giftCard.recipientCurrencyCode != "USD") {
      const exchangeRateResponse = await getExchangeRate(1, giftCard.recipientCurrencyCode, accessToken);
      exchangeRate = exchangeRateResponse.senderAmount;
    }

    if (!isGiftCardAvailable(giftCard, amountDaiWei)) {
      throw new Error(`The ordered gift card does not meet available criteria: ${JSON.stringify(giftCard)}`);
    }

    const giftCardValue = getGiftCardValue(giftCard, amountDaiWei, exchangeRate);

    const orderId = getGiftCardOrderId(txReceipt.from, txParsed.args.signature);

    const isDuplicate = await isDuplicateOrder(orderId, accessToken);
    if (isDuplicate) {
      return Response.json({ message: "The permit has already claimed a gift card." }, { status: 400 });
    }

    const order = await orderGiftCard(productId, giftCardValue, orderId, accessToken);

    if (order.status != "REFUNDED" && order.status != "FAILED") {
      return Response.json(order, { status: 200 });
    } else {
      throw new Error(`Order failed: ${JSON.stringify(order)}`);
    }
  } catch (error) {
    console.error("There was an error while processing your request.", error);
    return Response.json({ message: "There was an error while processing your request." }, { status: 500 });
  }
}

export async function getGiftCardById(productId: number, accessToken: AccessToken): Promise<GiftCard> {
  const url = `${getBaseUrl(accessToken.isSandbox)}/products/${productId}`;
  console.log(`Retrieving gift cards from ${url}`);
  const options = {
    method: "GET",
    headers: {
      ...commonHeaders,
      Authorization: `Bearer ${accessToken.token}`,
    },
  };

  const response = await fetch(url, options);
  const responseJson = await response.json();

  if (response.status != 200) {
    throw new Error(
      `Error from Reloadly API: ${JSON.stringify({
        status: response.status,
        message: (responseJson as ReloadlyFailureResponse).message,
      })}`
    );
  }
  console.log("response.status", response.status);
  console.log(`Response from ${url}`, responseJson);

  return responseJson as GiftCard;
}

async function orderGiftCard(productId: number, cardValue: number, identifier: string, accessToken: AccessToken): Promise<ReloadlyOrderResponse> {
  const url = `${getBaseUrl(accessToken.isSandbox)}/orders`;
  console.log(`Placing order at url: ${url}`);

  const requestBody = JSON.stringify({
    productId: productId,
    quantity: 1,
    unitPrice: cardValue.toFixed(2),
    customIdentifier: identifier,
    preOrder: false,
  });

  console.log(`Placing order at url: ${url}`);
  console.log(`Request body: ${requestBody}`);

  const options = {
    method: "POST",
    headers: {
      ...commonHeaders,
      Authorization: `Bearer ${accessToken.token}`,
    },
    body: requestBody,
  };

  const response = await fetch(url, options);
  const responseJson = await response.json();

  if (response.status != 200) {
    throw new Error(
      `Error from Reloadly API: ${JSON.stringify({
        status: response.status,
        message: (responseJson as ReloadlyFailureResponse).message,
      })}`
    );
  }

  console.log("Response status", response.status);
  console.log(`Response from ${url}`, responseJson);

  return responseJson as ReloadlyOrderResponse;
}

async function isDuplicateOrder(orderId: string, accessToken: AccessToken): Promise<boolean> {
  try {
    const transaction = await getTransactionFromOrderId(orderId, accessToken);
    return !!transaction.transactionId;
  } catch (error) {
    return false;
  }
}

async function getExchangeRate(usdAmount: number, fromCurrency: string, accessToken: AccessToken): Promise<ExchangeRate> {
  const url = `${getBaseUrl(accessToken.isSandbox)}/fx-rate?currencyCode=${fromCurrency}&amount=${usdAmount}`;
  console.log(`Retrieving url ${url}`);
  const options = {
    method: "GET",
    headers: {
      ...commonHeaders,
      Authorization: `Bearer ${accessToken.token}`,
    },
  };

  const response = await fetch(url, options);
  const responseJson = await response.json();

  if (response.status != 200) {
    throw new Error(
      `Error from Reloadly API: ${JSON.stringify({
        status: response.status,
        message: (responseJson as ReloadlyFailureResponse).message,
      })}`
    );
  }
  console.log("Response status", response.status);
  console.log(`Response from ${url}`, responseJson);

  return responseJson as ExchangeRate;
}

function validateTransaction(txParsed: TransactionDescription, txReceipt: TransactionReceipt, chainId: number, giftCard: GiftCard): Response | void {
  const rewardAmount = txParsed.args.transferDetails.requestedAmount;

  if (!isClaimableForAmount(giftCard, rewardAmount)) {
    return Response.json({ message: "Your reward amount is either too high or too low to buy this card." }, { status: 403 });
  }

  const errorResponse = Response.json({ message: "Transaction is not authorized to purchase gift card." }, { status: 403 });

  if (txReceipt.to.toLowerCase() != permit2Address.toLowerCase()) {
    console.error("Given transaction hash is not an interaction with permit2Address", `txReceipt.to=${txReceipt.to}`, `permit2Address=${permit2Address}`);
    return errorResponse;
  }

  if (txParsed.args.transferDetails.to.toLowerCase() != giftCardTreasuryAddress.toLowerCase()) {
    console.error(
      "Given transaction hash is not a token transfer to giftCardTreasuryAddress",
      `txParsed.args.transferDetails.to=${txParsed.args.transferDetails.to}`,
      `giftCardTreasuryAddress=${giftCardTreasuryAddress}`
    );
    return errorResponse;
  }

  if (txParsed.functionFragment.name != "permitTransferFrom") {
    console.error(
      "Given transaction hash is not call to contract function permitTransferFrom",
      `txParsed.functionFragment.name=${txParsed.functionFragment.name}`
    );
    return errorResponse;
  }

  if (txParsed.args.permit[0].token.toLowerCase() != chainIdToRewardTokenMap[chainId].toLowerCase()) {
    console.error(
      "Given transaction hash is not transferring the required ERC20 token.",
      JSON.stringify({
        transferredToken: txParsed.args.permit[0].token,
        requiredToken: Tokens.WXDAI.toLowerCase(),
      })
    );
    return errorResponse;
  }
}
