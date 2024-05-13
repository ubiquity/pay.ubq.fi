import { JsonRpcProvider } from "@ethersproject/providers/lib/json-rpc-provider";
import { Interface, formatEther } from "ethers/lib/utils";
import { Env, getAccessToken, getBaseUrl, getGiftCardOrderId, isProductAvailableForAmount } from "../shared/helpers";
import { AccessToken, NotOkReloadlyApiResponse, OrderRequestParams, ReloadlyOrderResponse, ReloadlyProduct } from "../shared/types";
import { validateEnvVars, validateRequestMethod } from "./validators";
import { TransactionReceipt, TransactionResponse } from "@ethersproject/providers";
import { permit2Abi } from "../static/scripts/rewards/abis/permit2Abi";
import { getTransactionFromOrderId } from "./get-order";
import { giftCardTreasuryAddress, permit2Address } from "../shared/constants";

export const networkRpcs: Record<number, string[]> = {
  1: ["https://gateway.tenderly.co/public/mainnet"],
  5: ["https://eth-goerli.public.blastapi.io"],
  100: ["https://rpc.gnosischain.com"],
  31337: ["http://127.0.0.1:8545"],
  31338: ["https://rpc.tenderly.co/fork/07e0d1c0-c5f5-4690-81ce-0676d0c8dbcd"],
};

export const onRequest: PagesFunction<Env> = async (ctx) => {
  try {
    validateRequestMethod(ctx.request.method, "POST");
    validateEnvVars(ctx);

    const accessToken = await getAccessToken(ctx.env);

    const { productId, txHash, chainId } = (await ctx.request.json()) as OrderRequestParams;

    if (isNaN(productId) || isNaN(chainId) || !(productId && txHash && chainId)) {
      throw new Error(`Invalid post parameters: ${JSON.stringify({ productId, txHash, chainId })}`);
    }

    if (!networkRpcs[chainId]) {
      throw new Error(`Unsupported chain: ${JSON.stringify({ chainId })}`);
    }

    const provider = new JsonRpcProvider(
      {
        url: networkRpcs[chainId][0],
        skipFetchSetup: true,
      },
      chainId
    );

    const [txReceipt, tx, product]: [TransactionReceipt, TransactionResponse, ReloadlyProduct] = await Promise.all([
      provider.getTransactionReceipt(txHash),
      provider.getTransaction(txHash),
      getProductById(productId, accessToken),
    ]);

    if (!txReceipt) {
      throw new Error(`Given transaction has not been mined yet. Please wait for it to be mined.`);
    }

    const iface = new Interface(permit2Abi);

    const txParsed = iface.parseTransaction({ data: tx.data });

    console.log("Parsed transaction data: ", JSON.stringify(txParsed));

    const rewardAmount = txParsed.args.transferDetails.requestedAmount;

    if (!isProductAvailableForAmount(product, rewardAmount)) {
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

    const amountDai = formatEther(txParsed.args.transferDetails.requestedAmount);

    const orderId = getGiftCardOrderId(txReceipt.from, txParsed.args.signature);

    const isDuplicate = await isDuplicateOrder(orderId, accessToken);
    if (isDuplicate) {
      return Response.json({ message: "The permit has already claimed a gift card." }, { status: 400 });
    }

    const order = await orderGiftCard(productId, amountDai, orderId, accessToken);

    if (order.status == "SUCCESSFUL") {
      return Response.json(order, { status: 200 });
    } else {
      throw new Error(`Order failed: ${JSON.stringify(order)}`);
    }
  } catch (error) {
    console.error("There was an error while processing your request.", error);
    return Response.json({ message: "There was an error while processing your request." }, { status: 500 });
  }
};

const getProductById = async (productId: number, accessToken: AccessToken) => {
  const url = `${getBaseUrl(accessToken.isSandbox)}/products/${productId}`;
  console.log(`Retrieving product from ${url}`);
  const options = {
    method: "GET",
    headers: {
      Accept: "application/com.reloadly.giftcards-v1+json",
      Authorization: `Bearer ${accessToken.token}`,
    },
  };

  const response = await fetch(url, options);
  const responseJson = await response.json();

  if (response.status != 200) {
    throw new Error(
      `Error from Reloadly API: ${JSON.stringify({
        status: response.status,
        message: (responseJson as NotOkReloadlyApiResponse).message,
      })}`
    );
  }
  console.log("response.status", response.status);
  console.log(`Response from ${url}`, responseJson);

  return responseJson as ReloadlyProduct;
};

const orderGiftCard = async (productId: number, amount: string, identifier: string, accessToken: AccessToken) => {
  const url = `${getBaseUrl(accessToken.isSandbox)}/orders`;
  console.log(`Placing order at url: ${url}`);

  const requestBody = JSON.stringify({
    productId: productId,
    quantity: 1,
    unitPrice: amount,
    customIdentifier: identifier,
    preOrder: false,
  });

  console.log(`Placing order at url: ${url}`);
  console.log(`Request body: ${requestBody}`);

  const options = {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/com.reloadly.giftcards-v1+json",
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
        message: (responseJson as NotOkReloadlyApiResponse).message,
      })}`
    );
  }

  console.log("Response status", response.status);
  console.log(`Response from ${url}`, responseJson);

  return responseJson as ReloadlyOrderResponse;
};

async function isDuplicateOrder(orderId: string, accessToken: AccessToken) {
  try {
    const transaction = await getTransactionFromOrderId(orderId, accessToken);
    return !!transaction.transactionId;
  } catch (error) {
    return false;
  }
}
