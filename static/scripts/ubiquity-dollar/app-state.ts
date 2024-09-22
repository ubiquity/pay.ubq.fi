import { BigNumber, BigNumberish } from "ethers";

export class AppState {
  public transaction = new Transaction();

  public clear() {
    this.transaction = new Transaction();
  }
}

export class Transaction {
  public date: Date = new Date();
  public country: string | null = null;
  public amount: BigNumberish | null = null;
  public txHash: string | null = null;
  public walletAddress: string | null = null;
  public chainId: number | null = null;
  public productId: number | null = null;
  public reloadlyTransactionId: number | null = null;

  public serialize() {
    return {
      date: this.date.toISOString(),
      amount: this.amount?.toString() ?? null,
      txHash: this.txHash,
      walletAddress: this.walletAddress,
      chainId: this.chainId,
      country: this.country,
      productId: this.productId,
      reloadlyTransactionId: this.reloadlyTransactionId,
    };
  }

  public static deserialize(data: ReturnType<Transaction["serialize"]>): Transaction {
    const transaction = new Transaction();
    transaction.date = new Date(data.date);
    transaction.amount = data.amount ? BigNumber.from(data.amount) : null;
    transaction.txHash = data.txHash;
    transaction.walletAddress = data.walletAddress;
    transaction.chainId = data.chainId;
    transaction.country = data.country;
    transaction.productId = data.productId;
    transaction.reloadlyTransactionId = data.reloadlyTransactionId;
    return transaction;
  }

  public setProduct(productId: number, country: string, amount: BigNumberish) {
    this.productId = productId;
    this.amount = amount;
    this.country = country;
  }

  public setTxHash(txHash: string, walletAddress: string, chainId: number) {
    this.walletAddress = walletAddress;
    this.txHash = txHash;
    this.chainId = chainId;
    Storage.saveTransaction(this);
  }

  public setReloadlyTransactionId(reloadlyTransactionId: number) {
    this.reloadlyTransactionId = reloadlyTransactionId;
    Storage.saveTransaction(this);
  }
}

export class Storage {
  private static _storageKey = "ubiquity-dollar-transactions";

  public static loadTransactions(): Transaction[] {
    const transactionStringified = localStorage.getItem(this._storageKey);
    if (!transactionStringified) {
      return [];
    }
    try {
      const transactions = JSON.parse(transactionStringified) as ReturnType<Transaction["serialize"]>[];
      return transactions
        .map((tx) => Transaction.deserialize(tx))
        .toSorted((a, b) => {
          return a.date.getTime() - b.date.getTime();
        });
    } catch (error) {
      console.error("Failed to parse transactions", error);
      return [];
    }
  }

  public static saveTransaction(transaction: Transaction) {
    const transactions = Storage.loadTransactions();
    // check if the transaction already exists and update it
    const existingTransaction = transactions.find((t) => t.txHash === transaction.txHash);
    if (existingTransaction) {
      Object.assign(existingTransaction, transaction);
    } else {
      transactions.push(transaction);
    }
    localStorage.setItem(this._storageKey, JSON.stringify(transactions.map((tx) => tx.serialize())));
  }
}

export const app = new AppState();
