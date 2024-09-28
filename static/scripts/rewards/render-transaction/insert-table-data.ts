import { ERC20PermitReward, ERC721PermitReward } from "@ubiquibot/permit-generation/types";
import { BigNumber, ethers } from "ethers";
import { app } from "../app-state";
import { ButtonController } from "../button-controller";
import { buttonControllers } from "../toaster";

function shortenAddress(address: string): string {
  return `${address.slice(0, 10)}...${address.slice(-8)}`;
}

export function insertErc20PermitTableData(
  reward: ERC20PermitReward,
  table: Element,
  treasury: { balance: BigNumber; allowance: BigNumber; decimals: number; symbol: string }
): Element {
  renderToFields(reward.beneficiary, reward.currentExplorerUrl, table);
  renderTokenFields(reward.tokenAddress, reward.currentExplorerUrl, table);
  renderDetailsFields(
    [
      {
        name: "From",
        value: `<a target="_blank" rel="noopener noreferrer" href="${app.getCurrentExplorerUrl(reward)}/address/${reward.owner}">${reward.owner}</a>`,
      },
      {
        name: "Expiry",
        value: (() => {
          const deadline = BigNumber.isBigNumber(reward.deadline) ? reward.deadline : BigNumber.from(reward.deadline);
          return deadline.lte(Number.MAX_SAFE_INTEGER.toString()) ? new Date(deadline.toNumber()).toLocaleString() : undefined;
        })(),
      },
      { name: "Balance", value: treasury.balance.gte(0) ? `${ethers.utils.formatUnits(treasury.balance, treasury.decimals)} ${treasury.symbol}` : "N/A" },
      { name: "Allowance", value: treasury.allowance.gte(0) ? `${ethers.utils.formatUnits(treasury.allowance, treasury.decimals)} ${treasury.symbol}` : "N/A" },
    ],
    table
  );

  // We need to update the controls after inserting the detail rows
  const controls = table.querySelector(".controls") as HTMLDivElement;
  buttonControllers[table.id] = new ButtonController(controls);
  table.setAttribute(`data-make-claim-rendered`, "true");

  return table.querySelector(".reward-amount") as Element;
}

export function insertErc721PermitTableData(reward: ERC721PermitReward, table: Element): Element {
  const requestedAmountElement = table.querySelector(".reward-amount") as Element;
  renderToFields(reward.beneficiary, app.getCurrentExplorerUrl(reward), table);
  renderTokenFields(reward.tokenAddress, app.getCurrentExplorerUrl(reward), table);
  const { GITHUB_REPOSITORY_NAME, GITHUB_CONTRIBUTION_TYPE, GITHUB_ISSUE_ID, GITHUB_ORGANIZATION_NAME, GITHUB_USERNAME } = reward.erc721Request?.metadata || {};
  renderDetailsFields(
    [
      {
        name: "NFT address",
        value: `<a target="_blank" rel="noopener noreferrer" href="${app.getCurrentExplorerUrl(reward)}/address/${reward.tokenAddress}">${reward.tokenAddress}</a>`,
      },
      {
        name: "Expiry",
        value: BigNumber.from(reward.deadline).lte(Number.MAX_SAFE_INTEGER.toString()) ? new Date(Number(reward.deadline)).toLocaleString() : undefined,
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
    ],
    table
  );
  table.setAttribute(`data-make-claim-rendered`, "true");
  return requestedAmountElement;
}

function renderDetailsFields(additionalDetails: { name: string; value: string | undefined }[], table: Element) {
  const additionalDetailsEl = table.querySelector("tbody") as Element;
  let additionalDetailsHtml = "";
  for (const { name, value } of additionalDetails) {
    if (!value) continue;
    additionalDetailsHtml += `<tr class="additional-detail">
      <th><div>${name}</div></th>
      <td><div>${value}</div></td>
    </tr>`;
  }

  additionalDetailsEl.innerHTML = additionalDetailsHtml + additionalDetailsEl.innerHTML;
}

function renderTokenFields(tokenAddress: string, explorerUrl: string, table: Element) {
  const tokenFull = table.querySelector(".token .full") as Element;
  const tokenShort = table.querySelector(".token .short") as Element;

  tokenFull.innerHTML = `<div>${tokenAddress}</div>`;
  tokenShort.innerHTML = `<div>${shortenAddress(tokenAddress)}</div>`;

  const tokenBoth = table.querySelector(`.reward-token`) as Element;
  tokenBoth.innerHTML = `<a target="_blank" rel="noopener noreferrer" href="${explorerUrl}/token/${tokenAddress}">${tokenBoth.innerHTML}</a>`;
}

function renderToFields(receiverAddress: string, explorerUrl: string, table: Element) {
  const toFull = table.querySelector(".reward-recipient .full") as Element;
  const toShort = table.querySelector(".reward-recipient .short") as Element;

  // if the for address is an ENS name neither will be found
  if (!toFull || !toShort) return;

  toFull.innerHTML = `<div>${receiverAddress}</div>`;
  toShort.innerHTML = `<div>${shortenAddress(receiverAddress)}</div>`;

  const toBoth = table.querySelector(`.reward-recipient`) as Element;
  toBoth.innerHTML = `<a target="_blank" rel="noopener noreferrer" href="${explorerUrl}/address/${receiverAddress}">${toBoth.innerHTML}</a>`;
}
