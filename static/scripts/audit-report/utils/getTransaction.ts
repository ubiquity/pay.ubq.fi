import axios from "axios";
import { Chain } from "../constants";
import { Transaction } from "../types/transaction";
import { getBlockInfo, updateBlockInfo } from "./blockInfo";

export async function getTxInfo(hash: string, url: string, chain: Chain): Promise<Transaction> {
  try {
    const transactionResponse = await axios.post(url, {
      jsonrpc: "2.0",
      id: 1,
      method: "eth_getTransactionByHash",
      params: [hash],
    });
    const transaction = transactionResponse.data.result as Transaction;

    const timestamp = await getBlockInfo(transaction.blockNumber, chain);
    if (timestamp !== null) {
      transaction.timestamp = timestamp;
    } else {
      const blockResponse = await axios.post(url, {
        jsonrpc: "2.0",
        id: 1,
        method: "eth_getBlockByNumber",
        params: [transaction.blockNumber, false],
      });
      transaction.timestamp = blockResponse.data.result.timestamp;
      await updateBlockInfo(transaction.blockNumber, transaction.timestamp, chain);
    }

    return transaction;
  } catch (error) {
    console.error(error);
    throw error;
  }
}
