import { BigNumberish, ethers, utils } from "ethers";
import { erc20Abi } from "../abis/erc20-abi";
import { app } from "../app-state";
import { openTokenModal } from "./token-selection";
export async function renderTokenSymbol({
  table,
  requestedAmountElement,
  tokenAddress,
  ownerAddress,
  amount,
  explorerUrl,
  isCowswapDown,
}: {
  table: Element;
  requestedAmountElement: Element;
  tokenAddress: string;
  ownerAddress: string;
  amount: BigNumberish;
  explorerUrl: string;
  isCowswapDown: boolean;
}): Promise<void> {
  const contract = new ethers.Contract(tokenAddress, erc20Abi, app.provider);

  let symbol, decimals;

  // Try to get the token info from localStorage
  const tokenInfo = localStorage.getItem(tokenAddress);

  if (tokenInfo) {
    // If the token info is in localStorage, parse it and use it
    const { decimals: storedDecimals, symbol: storedSymbol } = JSON.parse(tokenInfo);
    decimals = storedDecimals;
    symbol = storedSymbol;
  } else {
    // If the token info is not in localStorage, fetch it from the blockchain
    [symbol, decimals] = await Promise.all([contract.symbol(), contract.decimals()]);

    // Store the token info in localStorage for future use
    localStorage.setItem(tokenAddress, JSON.stringify({ decimals, symbol }));
  }

  // Format the amount
  let formattedAmount: string | number = parseFloat(utils.formatUnits(amount, decimals));

  // If the amount is an integer, convert it to a string
  if (Number.isInteger(formattedAmount)) {
    formattedAmount = formattedAmount.toString();
  } else {
    // If the amount is not an integer, round it to a max of 4 decimal places
    const decimals = Math.min(4, (formattedAmount.toString().split(".")[1] || "").length);
    formattedAmount = formattedAmount.toFixed(decimals);
  }

  table.setAttribute(`data-contract-loaded`, "true");
  let innerHtml = `<a target="_blank" rel="noopener noreferrer" href="${explorerUrl}/token/${tokenAddress}?a=${ownerAddress}">${formattedAmount} ${symbol}</a>`;
  if (!isCowswapDown) {
    innerHtml += `
    <div id="currency-settings">
      <svg xlmns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
        <path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6"></path>
      </svg>
    </div>`;
  }
  // amount symbol and gear icon
  requestedAmountElement.innerHTML = innerHtml;
  const currencySettingsElement = document.getElementById("currency-settings");
  if (currencySettingsElement) {
    currencySettingsElement.addEventListener("click", () => {
      openTokenModal(tokenAddress, {
        table,
        requestedAmountElement,
        ownerAddress,
        amount,
        explorerUrl,
      });
    });
  }
}

export async function renderNftSymbol({
  table,
  requestedAmountElement,
  tokenAddress,
  explorerUrl,
}: {
  table: Element;
  requestedAmountElement: Element;
  tokenAddress: string;
  explorerUrl: string;
}): Promise<void> {
  const contract = new ethers.Contract(tokenAddress, erc20Abi, app.provider);

  let symbol: string;

  // Try to get the token info from localStorage
  const tokenInfo = localStorage.getItem(tokenAddress);

  if (tokenInfo) {
    // If the token info is in localStorage, parse it and use it
    const { symbol: storedSymbol } = JSON.parse(tokenInfo);
    symbol = storedSymbol;
  } else {
    // If the token info is not in localStorage, fetch it from the blockchain
    symbol = await contract.symbol();

    // Store the token info in localStorage for future use
    localStorage.setItem(tokenAddress, JSON.stringify({ symbol }));
  }

  table.setAttribute(`data-contract-loaded`, "true");
  requestedAmountElement.innerHTML = `<a target="_blank" rel="noopener noreferrer" href="${explorerUrl}/token/${tokenAddress}">1 ${symbol}</a>`;
}
