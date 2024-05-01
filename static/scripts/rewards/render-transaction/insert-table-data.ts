import { ERC20Permit, ERC721Permit } from "@ubiquibot/permit-generation/types";
import { BigNumberish, formatUnits } from "ethers";
import { app, AppState } from "../app-state";

function shortenAddress(address: string): string {
  return `${address.slice(0, 10)}...${address.slice(-8)}`;
}

export function insertErc20PermitTableData(
  app: AppState,
  table: Element,
  treasury: { balance: BigNumberish; allowance: BigNumberish; decimals: number; symbol: string }
): Element {
  const reward = app.reward as ERC20Permit;
  const requestedAmountElement = document.getElementById("rewardAmount") as Element;
  renderToFields(reward.beneficiary, app.currentExplorerUrl);
  renderTokenFields(reward.tokenAddress, app.currentExplorerUrl);
  renderDetailsFields([
    { name: "From", value: `<a target="_blank" rel="noopener noreferrer" href="${app.currentExplorerUrl}/address/${reward.owner}">${reward.owner}</a>` },
    {
      name: "Expiry",
      value: (() => {
        const deadline = reward.deadline;
        return deadline <= Number.MAX_SAFE_INTEGER.toString() ? new Date(Number(deadline)).toLocaleString() : undefined;
      })(),
    },
    { name: "Balance", value: Number(treasury.balance) >= 0 ? `${formatUnits(treasury.balance, treasury.decimals)} ${treasury.symbol}` : "N/A" },
    { name: "Allowance", value: Number(treasury.allowance) >= 0 ? `${formatUnits(treasury.allowance, treasury.decimals)} ${treasury.symbol}` : "N/A" },
  ]);
  table.setAttribute(`data-make-claim-rendered`, "true");
  return requestedAmountElement;
}

export function insertErc721PermitTableData(reward: ERC721Permit, table: Element): Element {
  const requestedAmountElement = document.getElementById("rewardAmount") as Element;
  renderToFields(reward.beneficiary, app.currentExplorerUrl);
  renderTokenFields(reward.tokenAddress, app.currentExplorerUrl);
  const { GITHUB_REPOSITORY_NAME, GITHUB_CONTRIBUTION_TYPE, GITHUB_ISSUE_ID, GITHUB_ORGANIZATION_NAME, GITHUB_USERNAME } = reward.erc721Request?.metadata || {};
  renderDetailsFields([
    {
      name: "NFT address",
      value: `<a target="_blank" rel="noopener noreferrer" href="${app.currentExplorerUrl}/address/${reward.tokenAddress}">${reward.tokenAddress}</a>`,
    },
    {
      name: "Expiry",
      value: reward.deadline <= Number.MAX_SAFE_INTEGER.toString() ? new Date(Number(reward.deadline)).toLocaleString() : undefined,
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
    { name: "Contribution Type", value: GITHUB_CONTRIBUTION_TYPE?.split(",").join(", ") },
  ]);
  table.setAttribute(`data-make-claim-rendered`, "true");
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
  const toFull = document.querySelector("#rewardRecipient .full") as Element;
  const toShort = document.querySelector("#rewardRecipient .short") as Element;

  // if the for address is an ENS name neither will be found
  if (!toFull || !toShort) return;

  toFull.innerHTML = `<div>${receiverAddress}</div>`;
  toShort.innerHTML = `<div>${shortenAddress(receiverAddress)}</div>`;

  const toBoth = document.getElementById(`rewardRecipient`) as Element;
  toBoth.innerHTML = `<a target="_blank" rel="noopener noreferrer" href="${explorerUrl}/address/${receiverAddress}">${toBoth.innerHTML}</a>`;
}
