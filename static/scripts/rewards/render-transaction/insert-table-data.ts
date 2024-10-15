import { ERC20Permit, ERC721Permit } from "@ubiquibot/permit-generation/types";
import { BigNumber, ethers } from "ethers";
import { app, AppState } from "../app-state";

// dinamically shortens a string by slicing and elipsing it's middle
function shortenAddress(address: string): string {
  const initialLength = 42; // address has 42 chars
  const maxWidth = 520; // with to trigger shortning

  if (window.innerWidth >= maxWidth) {
    return address;
  }

  // remove 1 letter for every 6px below 520px
  const charsToRemove = Math.floor((maxWidth - window.innerWidth) / 6);

  // limit shortening
  const newLength = Math.max(initialLength - charsToRemove, 10);

  const frontChars = Math.ceil(newLength / 2);
  const backChars = newLength - frontChars;

  return `${address.slice(0, frontChars)}...${address.slice(-backChars)}`;
}

// function to update addresses based on the current window size
function updateAddresses() {
  const addressElements = document.getElementsByClassName("address");

  Array.from(addressElements).forEach((element) => {
    // get or store the original address as an attribute
    let fullAddress = element.getAttribute("data-full-address");
    if (!fullAddress) {
      fullAddress = element.innerHTML;
      element.setAttribute("data-full-address", fullAddress);
    }

    element.innerHTML = shortenAddress(fullAddress);
  });
}

// shortens address on load
updateAddresses();

// triggers shortening on resize
window.addEventListener("resize", updateAddresses);

function formatLargeNumber(value: BigNumber, decimals: number): string {
  const num = parseFloat(ethers.utils.formatUnits(value, decimals));

  if (num >= 1_000_000_000_000_000) {
    return "Unlimited"; // we can consider quintillion and above basically unlimited
  } else if (num >= 1_000_000_000_000) {
    return `${(num / 1_000_000_000_000).toFixed(1)}T`; // i.e: 1.2T
  } else if (num >= 1_000_000_000) {
    return `${(num / 1_000_000_000).toFixed(1)}B`; // i.e: 3.5B
  } else if (num >= 1_000_000) {
    return `${(num / 1_000_000).toFixed(1)}M`; // i.e: 1.2M
  } else if (num >= 1_000) {
    return `${(num / 1_000).toFixed(1)}K`; // i.e: 341.1K
  } else {
    return num.toFixed(2); // keep two decimals for smaller numbers
  }
}

export function insertErc20PermitTableData(
  app: AppState,
  table: Element,
  treasury: { balance: BigNumber; allowance: BigNumber; decimals: number; symbol: string }
): Element {
  const reward = app.reward as ERC20Permit;
  const requestedAmountElement = document.getElementById("rewardAmount") as Element;
  renderToFields(reward.beneficiary, app.currentExplorerUrl);
  renderTokenFields(reward.tokenAddress, app.currentExplorerUrl);
  renderDetailsFields([
    {
      name: "From",
      value: `<a class="address" target="_blank" rel="noopener noreferrer" href="${app.currentExplorerUrl}/address/${reward.owner}">${reward.owner}</a>`,
    },
    {
      name: "Expiry",
      value: (() => {
        const deadline = BigNumber.isBigNumber(reward.deadline) ? reward.deadline : BigNumber.from(reward.deadline);
        return deadline.lte(Number.MAX_SAFE_INTEGER.toString()) ? new Date(deadline.toNumber()).toLocaleString() : undefined;
      })(),
    },
    {
      name: "Balance",
      value: treasury.balance.gte(0) ? `${formatLargeNumber(treasury.balance, treasury.decimals)} ${treasury.symbol}` : "N/A",
    },
    {
      name: "Allowance",
      value: treasury.allowance.gte(0) ? `${formatLargeNumber(treasury.allowance, treasury.decimals)} ${treasury.symbol}` : "N/A",
    },
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
  const rewardRecipient = document.getElementById(`rewardRecipient`) as Element;
  rewardRecipient.innerHTML = `<a class="address" target="_blank" rel="noopener noreferrer" href="${explorerUrl}/address/${receiverAddress}">${receiverAddress}</a>`;
}
