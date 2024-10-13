import { formatUnits } from "ethers/lib/utils";
import { app, Storage, Transaction } from "./app-state";
import { getGiftCardOrderId } from "../../../shared/helpers";
import { getOrder, postOrder } from "../shared/api";
import { showPurchasedCard } from "./gift-card";
import { toaster } from "../rewards/toaster";

export function showTransactionHistory() {
  const transactionHistory = document.getElementById("transaction-history");
  if (!transactionHistory) {
    throw new Error("Could not find transaction-history element");
  }
  const txs = Storage.loadTransactions().filter((tx) => tx.date.getTime() > Date.now() - 1000 * 60 * 60 * 24 * 7);
  if (txs.length === 0) {
    return;
  }

  transactionHistory.innerHTML = `
    <h2>Transaction History</h2>
    <table>
        <tr>
        <th>Transaction Hash</th>
        <th>Date</th>
        <th>Amount</th>
        <th>Action</th>
        </tr>
        ${txs.map((tx) => transactionRowHtml(tx)).join("")}
    </table>
  `;

  txs.forEach((tx) => {
    if (!tx.txHash) {
      throw new Error("Could not find txHash");
    }
    const button = document.getElementById(tx.txHash);
    if (!button) {
      throw new Error("Could not find button");
    }
    button.addEventListener("click", async () => {
      button.setAttribute("data-loading", "true");
      await checkTransaction(tx);
      button.setAttribute("data-loading", "false");
    });
  });
}

function transactionRowHtml(transaction: Transaction) {
  return `
    <tr>
      <td><a href="https://etherscan.io/tx/${transaction.txHash}">${transaction.txHash?.slice(0, 16)}...</a></td>
      <td>${transaction.date.toISOString().split("T")[0]}</td>
      <td>${transaction.amount ? formatUnits(transaction.amount, 18) : 0} UUSD</td>
      <td>
        <button id="${transaction.txHash}" class="btn" data-loading="false">
          <div class="action">Open</div>
          <div class="icon">Open</div>
          <div class="loader">
            <svg
              version="1.1"
              id="L9"
              xmlns="http://www.w3.org/2000/svg"
              xmlns:xlink="http://www.w3.org/1999/xlink"
              width="33.33"
              height="33.33"
              viewBox="0 0 100 100"
              enable-background="new 0 0 0 0"
              xml:space="preserve"
            >
              <path fill="#fff" d="M73,50c0-12.7-10.3-23-23-23S27,37.3,27,50 M30.9,50c0-10.5,8.5-19.1,19.1-19.1S69.1,39.5,69.1,50"></path></svg
          ></div>
        </button>
      </td>
    </tr>
    `;
}

async function checkTransaction(transaction: Transaction) {
  if (!transaction.txHash || !transaction.walletAddress || !transaction.chainId || !transaction.country || !transaction.productId) {
    throw new Error("Unexpected error");
  }
  const orderId = getGiftCardOrderId(transaction.walletAddress, transaction.txHash);
  const response = await getOrder({ orderId });
  if (!response) {
    const order = await postOrder({
      type: "ubiquity-dollar",
      chainId: transaction.chainId,
      txHash: transaction.txHash,
      productId: transaction.productId,
      country: transaction.country,
    });
    if (!order) {
      toaster.create("error", "Order failed. Try again later.");
      return;
    }
  }

  app.transaction = transaction;
  await showPurchasedCard(orderId);
}
