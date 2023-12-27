import { BigNumberish, utils } from "ethers";
import { getErc20Contract } from "../get-contract";

export async function renderTokenSymbol({
  table,
  requestedAmountElement,
  tokenAddress,
  ownerAddress,
  networkId,
  amount,
  explorerUrl,
}: {
  table: Element;
  requestedAmountElement: Element;
  tokenAddress: string;
  ownerAddress: string;
  networkId: string;
  amount: BigNumberish;
  explorerUrl: string;
}): Promise<void> {
  const contract = await getErc20Contract(tokenAddress, networkId);
  const symbol = await contract.symbol();
  const decimals = await contract.decimals();
  table.setAttribute(`data-contract-loaded`, "true");
  requestedAmountElement.innerHTML = `<a target="_blank" rel="noopener noreferrer" href="${explorerUrl}/token/${tokenAddress}?a=${ownerAddress}">${utils.formatUnits(
    amount,
    decimals,
  )} ${symbol}</a>`;
}

export async function renderNftSymbol({
  table,
  requestedAmountElement,
  tokenAddress,
  networkId,
  explorerUrl,
}: {
  table: Element;
  requestedAmountElement: Element;
  tokenAddress: string;
  networkId: string;
  explorerUrl: string;
}): Promise<void> {
  const contract = await getErc20Contract(tokenAddress, networkId);
  const symbol = await contract.symbol();
  table.setAttribute(`data-contract-loaded`, "true");
  requestedAmountElement.innerHTML = `<a target="_blank" rel="noopener noreferrer" href="${explorerUrl}/token/${tokenAddress}">1 ${symbol}</a>`;
}
