import { ethers } from "ethers";
import { API_KEYS, Chain, ChainScan, RPC_URLS } from "./constants";
import { BountyHunter, GitHubUrlParts } from "./types";

export interface RateLimitOptions {
  method: string, url: string
}

const resultTableTbodyElem = document.querySelector("#resultTable tbody") as HTMLTableCellElement;

export const shortenTransactionHash = (hash: string | undefined, length = 8): string => {
  if(!hash) return ""
  const prefixLength = Math.floor(length / 2);
  const suffixLength = length - prefixLength;

  const prefix = hash.slice(0, prefixLength);
  const suffix = hash.slice(-suffixLength);

  return prefix + "..." + suffix;
};

export const populateTable = (owner: string, repo: string, issue_number: number, network: string, txHash: string, issue_title: string, amount: string, bounty_hunter: BountyHunter) => {
  if(!txHash) return; // permit not claimed
  const issue_url = `https://github.com/${owner}/${repo}/issues/${issue_number}`;
  const tx_url = `https://${getChainScan(network)}/tx/${txHash}`;
  const rows = `
    <tr>
        <td><a href="https://github.com/${owner}/${repo}" target="_blank">${owner}/${repo}</a></td>
        <td><a href="${issue_url}" target="_blank">#${issue_number} - ${issue_title}</a></td>
        <td><a href="${bounty_hunter?.url}" target="_blank">${bounty_hunter?.name}</a></td>
        <td><a href="${tx_url}" target="_blank">${ethers.BigNumber.isBigNumber(amount) ? ethers.utils.formatEther(amount) :  amount} ${network === Chain.Ethereum ? "DAI" : "WXDAI"}</a></td>
        <td><a href="${tx_url}" target="_blank">${shortenTransactionHash(txHash)}</a></td>
    </tr>`;

  resultTableTbodyElem.insertAdjacentHTML("beforeend", rows);
}

export const getChainScan = (chain: string) => {
  return chain === Chain.Ethereum ? ChainScan.Ethereum : ChainScan.Gnosis
}

export const getRandomAPIKey = (chain: Chain): string  => {
  const keys = API_KEYS[chain];
  if (!keys || keys.length === 0) {
    throw new Error(`No API Keys found for chain: ${chain}`);
  }

  const randomIndex = Math.floor(Math.random() * keys.length);
  return keys[randomIndex];
}

export const getRandomRpcUrl = (chain: Chain): string => {
  const urls = RPC_URLS[chain];
  if (!urls || urls.length === 0) {
    throw new Error(`No RPC URLs found for chain: ${chain}`);
  }

  const randomIndex = Math.floor(Math.random() * urls.length);
  return urls[randomIndex];
}

export const parseRepoUrl = (issueUrl: string): [string, string] => {
  const match = issueUrl.match(/github\.com\/([^/]+)\/([^/]+)\/issues\/\d+/i);
  if (match) {
    const owner = match[1];
    const repo = match[2];
    return [owner, repo];
  } else {
    throw new Error("Invalid GitHub issue URL format");
  }
};

export const getGitHubUrlPartsArray = (urls: string[]): GitHubUrlParts[] => {
  const githubUrlPartsArray: GitHubUrlParts[] = [];

  for (const url of urls) {
    const regex = /([^/]+)\/([^/]+)$/i;
    const matches = url.match(regex);
    if (matches && matches.length === 3) {
      const owner = matches[1];
      const repo = matches[2];
      githubUrlPartsArray.push({ owner, repo });
    }
  }

  return githubUrlPartsArray;
}

export const primaryRateLimitHandler = (retryAfter: number, options: RateLimitOptions) => {
  console.warn(`Request quota exhausted for request ${options.method} ${options.url}\nRetrying after ${retryAfter} seconds!`);
  return true;
};

export const secondaryRateLimitHandler = (retryAfter: number, options: RateLimitOptions) => {
  console.warn(`Secondary quota detected for request ${options.method} ${options.url}\nRetrying after ${retryAfter} seconds!`);
  return true;
};

export const isValidUrl = (urlString: string) => {
    try { 
      return Boolean(new URL(urlString)); 
    }
    catch(e){ 
      return false; 
    }
}

export const getCurrency = (comment: string) => {
  if (comment.includes('WXDAI')) {
    return Chain.Gnosis;
  } else if (comment.includes('DAI')) {
    return Chain.Ethereum;
  }
  return null;
}