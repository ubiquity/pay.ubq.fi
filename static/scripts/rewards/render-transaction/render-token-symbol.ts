import { BigNumberish, ethers, utils } from "ethers";
import { erc20Abi } from "../abis/erc20Abi";
import { app } from "../app-state";
export async function renderTokenSymbol({
  table,
  requestedAmountElement,
  tokenAddress,
  ownerAddress,
  amount,
  explorerUrl,
}: {
  table: Element;
  requestedAmountElement: Element;
  tokenAddress: string;
  ownerAddress: string;
  amount: BigNumberish;
  explorerUrl: string;
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
  const formattedAmount = parseFloat(utils.formatUnits(amount, decimals)).toFixed(0);

  table.setAttribute(`data-contract-loaded`, "true");
  requestedAmountElement.innerHTML = `<a target="_blank" rel="noopener noreferrer" href="${explorerUrl}/token/${tokenAddress}?a=${ownerAddress}">${formattedAmount} ${symbol}</a>`;
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
