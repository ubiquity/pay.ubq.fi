import axios from "axios";
import { ethers } from "ethers";
import { API_KEYS, Chain, ChainScan, RPC_URLS } from "./constants";
import { BountyHunter, GitHubUrlParts } from "./types";

export interface RateLimitOptions {
  method: string;
  url: string;
}

const resultTableTbodyElem = document.querySelector("#resultTable tbody") as HTMLTableCellElement;

type DataType = {
  jsonrpc: string;
  id: number;
  result: {
    number: string;
    timestamp: string;
    hash: string;
  };
};

const RPC_BODY = JSON.stringify({
  jsonrpc: "2.0",
  method: "eth_getBlockByNumber",
  params: ["latest", false],
  id: 1,
});

const RPC_HEADER = {
  "Content-Type": "application/json",
};

export const TX_EMPTY_VALUE = "N/A";

export function shortenTransactionHash(hash: string | undefined, length = 8): string {
  if (!hash || hash === TX_EMPTY_VALUE) return "";
  const prefixLength = Math.floor(length / 2);
  const suffixLength = length - prefixLength;

  const prefix = hash.slice(0, prefixLength);
  const suffix = hash.slice(-suffixLength);

  return prefix + "..." + suffix;
}

export function populateTable(
  owner: string,
  repo: string,
  issueNumber: number,
  network: string,
  txHash: string,
  issueTitle: string,
  amount: string,
  bountyHunter: BountyHunter
) {
  const issueUrl = `https://github.com/${owner}/${repo}/issues/${issueNumber}`;
  const txUrl = `https://${getChainScan(network)}/tx/${txHash}`;
  const disableLinkStyle = txHash === TX_EMPTY_VALUE ? 'disabled tabIndex="-1"' : "";
  const rows = `
    <tr>
        <td><a href="https://github.com/${owner}/${repo}" target="_blank">${owner}/${repo}</a></td>
        <td><a href="${issueUrl}" target="_blank">#${issueNumber} - ${issueTitle}</a></td>
        <td><a href="${bountyHunter?.url}" target="_blank">${bountyHunter?.name}</a></td>
        <td><a href="${txUrl}" target="_blank" ${disableLinkStyle}>${ethers.BigNumber.isBigNumber(amount) ? ethers.utils.formatEther(amount) : amount} ${
          network === Chain.Ethereum ? "DAI" : "WXDAI"
        }</a></td>
        <td><a href="${txUrl}" target="_blank" ${disableLinkStyle}>${shortenTransactionHash(txHash)}</a></td>
    </tr>`;

  resultTableTbodyElem.insertAdjacentHTML("beforeend", rows);
}

export function getChainScan(chain: string) {
  return chain === Chain.Ethereum ? ChainScan.Ethereum : ChainScan.Gnosis;
}

export function getRandomAPIKey(chain: Chain): string {
  const keys = API_KEYS[chain];
  if (!keys || keys.length === 0) {
    throw new Error(`No API Keys found for chain: ${chain}`);
  }

  const randomIndex = Math.floor(Math.random() * keys.length);
  return keys[randomIndex];
}

export function getRandomRpcUrl(chain: Chain): string {
  const urls = RPC_URLS[chain];
  if (!urls || urls.length === 0) {
    throw new Error(`No RPC URLs found for chain: ${chain}`);
  }

  const randomIndex = Math.floor(Math.random() * urls.length);
  return urls[randomIndex];
}

function verifyBlock(data: DataType) {
  try {
    const { jsonrpc, id, result } = data;
    const { number, timestamp, hash } = result;
    return jsonrpc === "2.0" && id === 1 && parseInt(number, 16) > 0 && parseInt(timestamp, 16) > 0 && hash.match(/[0-9|a-f|A-F|x]/gm)?.join("").length === 66;
  } catch (error) {
    return false;
  }
}

export async function getOptimalRPC(chain: Chain): Promise<string> {
  const promises = RPC_URLS[chain].map(async (baseURL: string) => {
    try {
      const startTime = performance.now();
      const API = axios.create({
        baseURL,
        headers: RPC_HEADER,
      });

      const { data } = await API.post("", RPC_BODY);
      const endTime = performance.now();
      const latency = endTime - startTime;
      if (verifyBlock(data)) {
        return Promise.resolve({
          latency,
          baseURL,
        });
      } else {
        return Promise.reject();
      }
    } catch (error) {
      return Promise.reject();
    }
  });

  const { baseURL: optimalRPC } = await Promise.any(promises);
  return optimalRPC;
}

export function parseRepoUrl(issueUrl: string): [string, string] {
  const match = issueUrl.match(/github\.com\/([^/]+)\/([^/]+)\/issues\/\d+/i);
  if (match) {
    const owner = match[1];
    const repo = match[2];
    return [owner, repo];
  } else {
    throw new Error("Invalid GitHub issue URL format");
  }
}

export function getGitHubUrlPartsArray(urls: string[]): GitHubUrlParts[] {
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

export function primaryRateLimitHandler(retryAfter: number, options: RateLimitOptions) {
  console.warn(`Request quota exhausted for request ${options.method} ${options.url}\nRetrying after ${retryAfter} seconds!`);
  return true;
}

export function secondaryRateLimitHandler(retryAfter: number, options: RateLimitOptions) {
  console.warn(`Secondary quota detected for request ${options.method} ${options.url}\nRetrying after ${retryAfter} seconds!`);
  return true;
}

export function isValidUrl(urlString: string) {
  try {
    return Boolean(new URL(urlString));
  } catch (e) {
    return false;
  }
}

export function getCurrency(id: number) {
  if (id === 100) {
    return Chain.Gnosis;
  } else if (id === 1) {
    return Chain.Ethereum;
  }
  return null;
}
