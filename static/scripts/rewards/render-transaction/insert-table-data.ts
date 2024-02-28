import { ethers } from "ethers";
import { app } from ".";
import { Erc20Permit, Erc721Permit } from "./tx-type";
import { fetchTreasury } from "../web3/erc20-permit";
import { renderTokenSymbol } from "./render-token-symbol";
import { networkExplorers } from "../constants";

export function shortenAddress(address: string): string {
  return `${address.slice(0, 10)}...${address.slice(-8)}`;
}

export async function insertErc20PermitTableData(
  permit: Erc20Permit,
  provider: ethers.providers.JsonRpcProvider,
  symbol: string,
  decimals: number,
  table: Element
) {
  const requestedAmountElement = document.getElementById("rewardAmount") as Element;
  renderToFields(permit.transferDetails.to, app.currentExplorerUrl);
  renderTokenFields(permit.permit.permitted.token, app.currentExplorerUrl);

  renderDetailsFields([
    { name: "From", value: `<a target="_blank" rel="noopener noreferrer" href="${app.currentExplorerUrl}/address/${permit.owner}">${permit.owner}</a>` },
    {
      name: "Expiry",
      value: permit.permit.deadline.lte(Number.MAX_SAFE_INTEGER.toString()) ? new Date(permit.permit.deadline.toNumber()).toLocaleString() : undefined,
    },
    { name: "Balance", value: "Loading..." },
    { name: "Allowance", value: "Loading..." },
  ]);

  renderTokenSymbol({
    requestedAmountElement,
    tokenAddress: permit.permit.permitted.token,
    ownerAddress: permit.owner,
    amount: permit.transferDetails.requestedAmount,
    explorerUrl: networkExplorers[permit.networkId],
    symbol,
    decimals,
  });

  // Optimistically rendered what we can so consider it loaded
  table.setAttribute(`data-claim`, "ok");
  table.setAttribute(`data-contract-loaded`, "true");
  table.setAttribute(`data-claim-rendered`, "true");

  const { balance, allowance } = await fetchTreasury(permit.permit.permitted.token, permit.owner, provider);

  renderDetailsFields([
    { name: "From", value: `<a target="_blank" rel="noopener noreferrer" href="${app.currentExplorerUrl}/address/${permit.owner}">${permit.owner}</a>` },
    {
      name: "Expiry",
      value: permit.permit.deadline.lte(Number.MAX_SAFE_INTEGER.toString()) ? new Date(permit.permit.deadline.toNumber()).toLocaleString() : undefined,
    },
    { name: "Balance", value: balance.gte(0) ? `${ethers.utils.formatUnits(balance, decimals)} ${symbol}` : "N/A" },
    { name: "Allowance", value: allowance.gte(0) ? `${ethers.utils.formatUnits(allowance, decimals)} ${symbol}` : "N/A" },
  ]);
}

export function insertErc721PermitTableData(permit: Erc721Permit, table: Element): Element {
  const requestedAmountElement = document.getElementById("rewardAmount") as Element;
  renderToFields(permit.request.beneficiary, app.currentExplorerUrl);
  renderTokenFields(permit.nftAddress, app.currentExplorerUrl);
  const { GITHUB_REPOSITORY_NAME, GITHUB_CONTRIBUTION_TYPE, GITHUB_ISSUE_ID, GITHUB_ORGANIZATION_NAME, GITHUB_USERNAME } = permit.nftMetadata;
  renderDetailsFields([
    {
      name: "NFT address",
      value: `<a target="_blank" rel="noopener noreferrer" href="${app.currentExplorerUrl}/address/${permit.nftAddress}">${permit.nftAddress}</a>`,
    },
    {
      name: "Expiry",
      value: permit.request.deadline.lte(Number.MAX_SAFE_INTEGER.toString()) ? new Date(permit.request.deadline.toNumber()).toLocaleString() : undefined,
    },
    {
      name: "GitHub Organization",
      value: `<a target="_blank" rel="noopener noreferrer" href="https://github.com/${GITHUB_ORGANIZATION_NAME}">${GITHUB_ORGANIZATION_NAME}</a>`,
    },
    {
      name: "GitHub Repository",
      value: `<a target="_blank" rel="noopener noreferrer" href="https://github.com/${GITHUB_ORGANIZATION_NAME}/${GITHUB_REPOSITORY_NAME}">${GITHUB_REPOSITORY_NAME}</a>`,
    },
    {
      name: "GitHub Issue",
      value: `<a target="_blank" rel="noopener noreferrer" href="https://github.com/${GITHUB_ORGANIZATION_NAME}/${GITHUB_REPOSITORY_NAME}/issues/${GITHUB_ISSUE_ID}">${GITHUB_ISSUE_ID}</a>`,
    },
    {
      name: "GitHub Username",
      value: `<a target="_blank" rel="noopener noreferrer" href="https://github.com/${GITHUB_USERNAME}">${GITHUB_USERNAME}</a>`,
    },
    { name: "Contribution Type", value: GITHUB_CONTRIBUTION_TYPE.split(",").join(", ") },
  ]);
  table.setAttribute(`data-claim-rendered`, "true");
  return requestedAmountElement;
}

function renderDetailsFields(additionalDetails: { name: string; value: string | undefined }[]) {
  const additionalDetailsDiv = document.getElementById("additionalDetailsTable") as Element;
  let additionalDetailsHtml = "";
  for (const { name, value } of additionalDetails) {
    if (!value) continue;
    additionalDetailsHtml += `<tr>
      <th><div>${name}</div></th>
      <td><div>${value}</div></td>
    </tr>`;
  }

  additionalDetailsDiv.innerHTML = additionalDetailsHtml;
}

function renderTokenFields(tokenAddress: string, explorerUrl: string) {
  const tokenFull = document.querySelector("#Token .full") as Element;
  const tokenShort = document.querySelector("#Token .short") as Element;
  tokenFull.innerHTML = `<div>${tokenAddress}</div>`;
  tokenShort.innerHTML = `<div>${shortenAddress(tokenAddress)}</div>`;

  const tokenBoth = document.getElementById(`rewardToken`) as Element;
  tokenBoth.innerHTML = `<a target="_blank" rel="noopener noreferrer" href="${explorerUrl}/token/${tokenAddress}">${tokenBoth.innerHTML}</a>`;
}

function renderToFields(receiverAddress: string, explorerUrl: string) {
  const toFull = document.querySelector("#To .full") as Element;
  const toShort = document.querySelector("#To .short") as Element;
  toFull.innerHTML = `<div>${receiverAddress}</div>`;
  toShort.innerHTML = `<div>${shortenAddress(receiverAddress)}</div>`;

  const toBoth = document.getElementById(`rewardRecipient`) as Element;
  toBoth.innerHTML = `<a target="_blank" rel="noopener noreferrer" href="${explorerUrl}/address/${receiverAddress}">${toBoth.innerHTML}</a>`;
}
