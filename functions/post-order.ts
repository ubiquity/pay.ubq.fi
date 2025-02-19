import { Interface, TransactionDescription } from "@ethersproject/abi";
import { TransactionReceipt, TransactionResponse } from "@ethersproject/providers";
import { verifyMessage } from "@ethersproject/wallet";
import { BigNumber } from "ethers";
import { PostOrderParams, postOrderParamsSchema } from "../shared/api-types";
import { giftCardTreasuryAddress, permit2Address, ubiquityDollarAllowedChainIds, ubiquityDollarChainAddresses } from "../shared/constants";
import { getGiftCardOrderId, getMintMessageToSign } from "../shared/helpers";
import { getGiftCardValue, isClaimableForAmount } from "../shared/pricing";
import { ExchangeRate, GiftCard } from "../shared/types";
import { useRpcHandler } from "../shared/use-rpc-handler";
import { erc20Abi } from "../static/scripts/rewards/abis/erc20-abi";
import { permit2Abi } from "../static/scripts/rewards/abis/permit2-abi";
import { getTransactionFromOrderId } from "./get-order";
import { findBestCard } from "./utils/best-card-finder";
import { commonHeaders, getAccessToken, getReloadlyApiBaseUrl } from "./utils/shared";
import { AccessToken, Context, ReloadlyFailureResponse, ReloadlyOrderResponse } from "./utils/types";
import { validateEnvVars, validateRequestMethod } from "./utils/validators";

export async function onRequest(ctx: Context): Promise<Response> {
  try {
    validateRequestMethod(ctx.request.method, "POST");
    validateEnvVars(ctx);

    const accessToken = await getAccessToken(ctx.env);

    const result = postOrderParamsSchema.safeParse(await ctx.request.json());
    if (!result.success) {
      throw new Error(`Invalid post parameters: ${JSON.stringify(result.error.errors)}`);
    }
    const { type, productId, txHash, chainId, country } = result.data;

    const provider = await useRpcHandler(chainId);

    const [txReceipt, tx, giftCard]: [TransactionReceipt, TransactionResponse, GiftCard] = await Promise.all([
      provider.getTransactionReceipt(txHash),
      provider.getTransaction(txHash),
      getGiftCardById(productId, accessToken),
    ]);

    if (!txReceipt) {
      throw new Error(`Given transaction has not been mined yet. Please wait for it to be mined.`);
    }

    let amountDaiWei;
    let orderId;

    if (type === "ubiquity-dollar") {
      const iface = new Interface(erc20Abi);
      const txParsed = iface.parseTransaction({ data: tx.data });
      console.log("Parsed transaction data: ", JSON.stringify(txParsed));

      const validationErr = validateTransferTransaction(txParsed, txReceipt, chainId, giftCard);
      if (validationErr) {
        return Response.json({ message: validationErr }, { status: 403 });
      }

      orderId = getGiftCardOrderId(txReceipt.from, txHash);
      amountDaiWei = txParsed.args[1];
    } else if (type === "permit") {
      const iface = new Interface(permit2Abi);

      const txParsed = iface.parseTransaction({ data: tx.data });
      console.log("Parsed transaction data: ", JSON.stringify(txParsed));

      const validationErr = validatePermitTransaction(txParsed, txReceipt, result.data, giftCard);
      if (validationErr) {
        return Response.json({ message: validationErr }, { status: 403 });
      }

      amountDaiWei = txParsed.args.transferDetails.requestedAmount;
      orderId = getGiftCardOrderId(txReceipt.from, txParsed.args.signature);
    }

    let exchangeRate = 1;
    if (giftCard.recipientCurrencyCode != "USD") {
      const exchangeRateResponse = await getExchangeRate(1, giftCard.recipientCurrencyCode, accessToken);
      exchangeRate = exchangeRateResponse.senderAmount;
    }

    const bestCard = await findBestCard(country, amountDaiWei, accessToken);
    if (bestCard.productId != productId) {
      throw new Error(`You are not ordering the suitable card: ${JSON.stringify({ ordered: productId, suitable: bestCard })}`);
    }

    const giftCardValue = getGiftCardValue(giftCard, amountDaiWei, exchangeRate);

    const isDuplicate = await isDuplicateOrder(orderId, accessToken);
    if (isDuplicate) {
      return Response.json({ message: "The permit has already claimed a gift card." }, { status: 400 });
    }

    const order = await orderGiftCard(txReceipt.from.toLowerCase(), productId, giftCardValue, orderId, accessToken);

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
  const url = `${getReloadlyApiBaseUrl(accessToken.isSandbox)}/products/${productId}`;
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

async function orderGiftCard(
  userId: string,
  productId: number,
  cardValue: number,
  identifier: string,
  accessToken: AccessToken
): Promise<ReloadlyOrderResponse> {
  const url = `${getReloadlyApiBaseUrl(accessToken.isSandbox)}/orders`;
  console.log(`Placing order at url: ${url}`);

  const requestBody = JSON.stringify({
    productId: productId,
    quantity: 1,
    unitPrice: cardValue,
    customIdentifier: identifier,
    preOrder: false,
    productAdditionalRequirements: {
      userId: userId,
    },
    senderName: "Ubiquity",
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
  const url = `${getReloadlyApiBaseUrl(accessToken.isSandbox)}/fx-rate?currencyCode=${fromCurrency}&amount=${usdAmount}`;
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

function validateTransferTransaction(txParsed: TransactionDescription, txReceipt: TransactionReceipt, chainId: number, giftCard: GiftCard): string | null {
  const transferAmount = txParsed.args[1];

  if (!ubiquityDollarAllowedChainIds.includes(chainId)) {
    return "Unsupported chain";
  }

  if (!isClaimableForAmount(giftCard, transferAmount)) {
    return "Your reward amount is either too high or too low to buy this card.";
  }

  if (txParsed.functionFragment.name != "transfer") {
    return "Given transaction is not a token transfer";
  }

  const ubiquityDollarErc20Address = ubiquityDollarChainAddresses[chainId];
  if (txReceipt.to.toLowerCase() != ubiquityDollarErc20Address.toLowerCase()) {
    return "Given transaction is not a Ubiquity Dollar transfer";
  }

  if (txParsed.args[0].toLowerCase() != giftCardTreasuryAddress.toLowerCase()) {
    return "Given transaction is not a token transfer to treasury address";
  }

  return null;
}

function validatePermitTransaction(
  txParsed: TransactionDescription,
  txReceipt: TransactionReceipt,
  postOrderParams: PostOrderParams,
  giftCard: GiftCard
): string | null {
  if (!ubiquityDollarAllowedChainIds.includes(postOrderParams.chainId)) {
    return "Unsupported chain";
  }

  if (BigNumber.from(txParsed.args.permit.deadline).lt(Math.floor(Date.now() / 1000))) {
    return "The reward has expired.";
  }

  const { type, productId, txHash, chainId, country, signedMessage } = postOrderParams;
  if (!signedMessage) {
    console.error(`Signed message is empty. ${JSON.stringify({ signedMessage })}`);
    return "Signed message is missing in the request.";
  }
  const mintMessageToSign = getMintMessageToSign(type, chainId, txHash, productId, country);
  const signingWallet = verifyMessage(mintMessageToSign, signedMessage).toLocaleLowerCase();
  if (signingWallet != txReceipt.from.toLowerCase()) {
    console.error(
      `Signed message verification failed: ${JSON.stringify({
        wallet: txReceipt.from.toLowerCase(),
        signedMessage,
        type,
        chainId,
        txHash,
        productId,
        country,
      })}`
    );
    return "You have provided invalid signed message.";
  }

  const rewardAmount = txParsed.args.transferDetails.requestedAmount;

  if (!isClaimableForAmount(giftCard, rewardAmount)) {
    return "Your reward amount is either too high or too low to buy this card.";
  }

  const wrongContractErr = "Transaction is not authorized to purchase gift card.";

  if (txReceipt.to.toLowerCase() != permit2Address.toLowerCase()) {
    console.error("Given transaction hash is not an interaction with permit2Address", `txReceipt.to=${txReceipt.to}`, `permit2Address=${permit2Address}`);
    return wrongContractErr;
  }

  if (txParsed.args.transferDetails.to.toLowerCase() != giftCardTreasuryAddress.toLowerCase()) {
    console.error(
      "Given transaction hash is not a token transfer to giftCardTreasuryAddress",
      `txParsed.args.transferDetails.to=${txParsed.args.transferDetails.to}`,
      `giftCardTreasuryAddress=${giftCardTreasuryAddress}`
    );
    return wrongContractErr;
  }

  if (txParsed.functionFragment.name != "permitTransferFrom") {
    console.error(
      "Given transaction hash is not call to contract function permitTransferFrom",
      `txParsed.functionFragment.name=${txParsed.functionFragment.name}`
    );
    return wrongContractErr;
  }

  if (txParsed.args.permit[0].token.toLowerCase() != ubiquityDollarChainAddresses[postOrderParams.chainId].toLowerCase()) {
    console.error(
      "Given transaction hash is not transferring the required ERC20 token.",
      JSON.stringify({
        transferredToken: txParsed.args.permit[0].token,
        requiredToken: ubiquityDollarChainAddresses[postOrderParams.chainId],
      })
    );
    return wrongContractErr;
  }

  return null;
}
