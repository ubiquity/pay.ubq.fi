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
  const symbol = await contract.symbol();
  const decimals = await contract.decimals();
  table.setAttribute(`data-contract-loaded`, "true");
  requestedAmountElement.innerHTML = `<a target="_blank" rel="noopener noreferrer" href="${explorerUrl}/token/${tokenAddress}?a=${ownerAddress}">${utils.formatUnits(
    amount,
    decimals
  )} ${symbol}</a>`;
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
  const symbol = await contract.symbol();
  table.setAttribute(`data-contract-loaded`, "true");
  requestedAmountElement.innerHTML = `<a target="_blank" rel="noopener noreferrer" href="${explorerUrl}/token/${tokenAddress}">1 ${symbol}</a>`;
}
