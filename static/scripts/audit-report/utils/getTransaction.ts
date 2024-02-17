import axios from "axios";
import { Chain } from "../constants";
import { ITransaction } from "../types/transaction";
import { getBlockInfo, updateBlockInfo } from "./blockInfo";

export const getTxInfo = async (hash: string, url: string, chain: Chain): Promise<ITransaction> => {
  try {
    const transactionResponse = await axios.post(url, {
      jsonrpc: "2.0",
      id: 1,
      method: "eth_getTransactionByHash",
      params: [hash],
    });
    const transaction = transactionResponse.data.result as ITransaction;

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
      updateBlockInfo(transaction.blockNumber, transaction.timestamp, chain);
    }

    return transaction;
  } catch (error) {
    console.error(error);
    throw error;
  }
};
