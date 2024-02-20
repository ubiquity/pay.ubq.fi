import { BigNumberish, utils } from "ethers";
import { getErc20Contract } from "../helpers";
import { JsonRpcProvider } from "@ethersproject/providers";

export const tokens = [
  {
    name: "WXDAI",
    address: "0xe91d153e0b41518a2ce8dd3d7944fa863463a97d",
  },
  {
    name: "DAI",
    address: "0x6b175474e89094c44da98b954eedeac495271d0f",
  },
];

export function renderTokenSymbol({
  requestedAmountElement,
  tokenAddress,
  ownerAddress,
  amount,
  explorerUrl,
  symbol,
  decimals,
}: {
  requestedAmountElement: Element;
  tokenAddress: string;
  ownerAddress: string;
  amount: BigNumberish;
  explorerUrl: string;
  symbol: string;
  decimals: number;
}) {
  return (requestedAmountElement.innerHTML = `<a target="_blank" rel="noopener noreferrer" href="${explorerUrl}/token/${tokenAddress}?a=${ownerAddress}">${utils.formatUnits(
    amount,
    decimals
  )} ${symbol}</a>`);
}

export async function renderNftSymbol({
  table,
  requestedAmountElement,
  tokenAddress,
  explorerUrl,
  provider,
}: {
  table: Element;
  requestedAmountElement: Element;
  tokenAddress: string;
  explorerUrl: string;
  provider: JsonRpcProvider;
}): Promise<void> {
  const contract = await getErc20Contract(tokenAddress, provider);
  const symbol = await contract.symbol();
  table.setAttribute(`data-contract-loaded`, "true");
  requestedAmountElement.innerHTML = `<a target="_blank" rel="noopener noreferrer" href="${explorerUrl}/token/${tokenAddress}">1 ${symbol}</a>`;
}
