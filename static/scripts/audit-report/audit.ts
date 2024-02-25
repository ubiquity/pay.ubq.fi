import { throttling } from "@octokit/plugin-throttling";
import { Octokit } from "@octokit/rest";
import { createClient } from "@supabase/supabase-js";
import { ethers } from "ethers";
import { Chain } from "./constants";
import {
  getCurrency,
  getGitHubUrlPartsArray,
  populateTable,
  primaryRateLimitHandler,
  RateLimitOptions,
  secondaryRateLimitHandler,
  TX_EMPTY_VALUE,
} from "./helpers";
import { ElemInterface, EtherInterface, GitHubUrlParts, GitInterface, QuickImport, SavedData, StandardInterface } from "./types";

declare const SUPABASE_URL: string;
declare const SUPABASE_ANON_KEY: string;

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const rateOctokit = Octokit.plugin(throttling);

let octokit: Octokit;

let REPOSITORY_URL = "";
let GITHUB_PAT = "";

const repoArray: string[] = [];

const resultTableElem = document.querySelector("#resultTable") as HTMLElement;
const resultTableTbodyElem = document.querySelector("#resultTable tbody") as HTMLTableCellElement;
const getReportElem = document.querySelector("#getReport") as HTMLButtonElement;
const reportLoader = document.querySelector("#report-loader") as HTMLElement;

// TODO: should be generated directly from the Supabase db schema
interface Permit {
  id: number;
  created: Date;
  updated: Date;
  amount: string;
  nonce: string;
  deadline: string;
  signature: string;
  token_id: number;
  partner_id: null | number;
  beneficiary_id: number;
  transaction: string;
  location_id: number;
  locations: {
    id: number;
    node_id: string;
    node_type: string;
    updated: Date;
    created: Date;
    node_url: string;
    user_id: number;
    repository_id: number;
    organization_id: number;
    comment_id: number;
    issue_id: number;
  };
  users: {
    id: number;
    created: string;
    updated: string;
    wallet_id: number;
    location_id: number;
    wallets: {
      id: number;
      created: string;
      updated: Date | null;
      address: string;
      location_id: number | null;
    };
  };
  tokens: {
    id: 1;
    created: string;
    updated: string;
    network: number;
    address: string;
    location_id: null | number;
  };
  owner: string;
  repo: string;
  network_id: number;
}

const permitList: Permit[] = [];

const elemList: ElemInterface[] = [];

function parseAndAddUrls(input: string): void {
  const urls = input.split(",").map((url) => url.trim());
  repoArray.push(...urls);
}

function toggleLoader(type: "none" | "block") {
  getReportElem.disabled = type === "block";
  reportLoader.style.display = type;
}

class SmartQueue {
  private readonly _queue: Map<string, StandardInterface>;

  constructor() {
    this._queue = new Map();
  }

  add(key: string, value: StandardInterface) {
    if (this._queue.has(key)) {
      const queueValue = this._queue.get(key) as StandardInterface;
      queueValue.s[value.t] = value.s[value.t] as object extends GitInterface ? GitInterface : object extends EtherInterface ? EtherInterface : never;
    } else {
      this._queue.set(key, value);
    }
    const {
      s: { ether, git, network },
      c: { amount },
    } = this._queue.get(key) as StandardInterface;
    // check for undefined
    if (git?.issue_number) {
      elemList.push({
        id: git.issue_number,
        tx: ether?.txHash || TX_EMPTY_VALUE, // @TODO - handle this better
        amount: ethers.utils.formatEther(amount),
        title: git.issue_title,
        bounty_hunter: git.bounty_hunter,
        owner: git.owner,
        repo: git.repo,
        network,
      });
    }

    if (elemList.length > 0) {
      resultTableTbodyElem.innerHTML = "";
      for (const data of elemList) {
        populateTable(data?.owner, data?.repo, data?.id, data?.network, data?.tx, data?.title, data?.amount, data?.bounty_hunter);
      }
    }
  }

  get() {
    return this._queue.values() as Readonly<IterableIterator<StandardInterface>>;
  }

  clear() {
    this._queue.clear();
  }
}

const updateQueue = new SmartQueue();

async function getPermitsForRepo(owner: string, repo: string) {
  const permitList: Permit[] = [];
  try {
    const { data: gitData } = await octokit.rest.repos.get({
      owner,
      repo,
    });
    const { data } = await supabase
      .from("permits")
      .select("*, locations(*), users(*, wallets(*)), tokens(*)")
      .eq("locations.repository_id", gitData?.id)
      .not("locations", "is", null);
    if (data) {
      permitList.push(...data.map((d) => ({ ...d, owner, repo })));
    }
  } catch (error) {
    console.error(error);
    throw error;
  }

  return permitList;
}

async function fetchPermits(repoUrls: GitHubUrlParts[]) {
  try {
    const permitsPromises = repoUrls.map((repoUrl) => getPermitsForRepo(repoUrl.owner, repoUrl.repo));
    const allPermits = await Promise.all(permitsPromises);

    for (let i = 0; i < allPermits.length; i++) {
      const issues = allPermits[i];
      permitList.push(...issues);
      console.log(`Fetched ${issues.length} permits for repository ${repoUrls[i].owner}/${repoUrls[i].repo}`);
    }
    for (const permit of permitList) {
      const { data: userData } = await octokit.request("GET /user/:id", { id: permit.locations.user_id });
      const { node_url } = permit.locations;
      const lastSlashIndex = node_url.lastIndexOf("/");
      const hashIndex = node_url.lastIndexOf("#") || node_url.length;
      const issueNumber = Number(node_url.substring(lastSlashIndex + 1, hashIndex));
      const { data: issueData } = await octokit.rest.issues.get({
        issue_number: issueNumber,
        owner: permit.owner,
        repo: permit.repo,
      });
      updateQueue.add(permit.signature, {
        c: {
          amount: permit.amount,
          deadline: permit.deadline,
          nonce: permit.nonce,
          owner: permit.owner,
          signature: permit.signature,
          to: permit.users.wallets.address,
          token: permit.tokens.address,
        },
        k: permit.signature,
        s: {
          ether: undefined,
          git: {
            bounty_hunter: {
              name: userData.login,
              url: userData.html_url,
            },
            issue_number: issueData.number,
            issue_title: issueData.title,
            owner: permit.owner,
            repo: permit.repo,
          },
          network: getCurrency(permit.network_id) || Chain.Ethereum,
        },
        t: "git",
      });
    }
  } catch (error) {
    console.error(`Error fetching issues: ${error}`);
  }

  return permitList;
}

async function resetInit() {
  permitList.splice(0, permitList.length);
  elemList.splice(0, elemList.length);
  repoArray.splice(0, repoArray.length);
  updateQueue.clear();
}

async function asyncInit() {
  await resetInit();
}

function tabInit(repoUrls: GitHubUrlParts[]) {
  fetchPermits(repoUrls)
    .finally(() => toggleLoader("none"))
    .catch((error) => console.error(error));
}

function auditInit() {
  getReportElem.addEventListener("click", async () => {
    toggleLoader("block");
    resultTableElem.style.display = "table";
    resultTableTbodyElem.innerHTML = "";
    const quickImportValue = (document.querySelector("#quickName") as HTMLTextAreaElement).value;
    if (quickImportValue !== "") {
      const { REPO, PAT }: QuickImport = JSON.parse(quickImportValue);
      REPOSITORY_URL = REPO.toLocaleLowerCase();
      GITHUB_PAT = PAT;
      parseAndAddUrls(REPOSITORY_URL);
    } else {
      REPOSITORY_URL = (document.querySelector("#repoURLs") as HTMLInputElement).value.toLocaleLowerCase();
      GITHUB_PAT = (document.querySelector("#githubPAT") as HTMLInputElement).value;
      parseAndAddUrls(REPOSITORY_URL);
    }

    const REPOS = getGitHubUrlPartsArray(repoArray);

    if (REPOSITORY_URL !== "" && GITHUB_PAT !== "" && REPOS.length > 0) {
      await asyncInit();
      octokit = new rateOctokit({
        auth: GITHUB_PAT,
        throttle: {
          onRateLimit: (retryAfter, options) => {
            return primaryRateLimitHandler(retryAfter, options as RateLimitOptions);
          },
          onSecondaryRateLimit: (retryAfter, options) => {
            return secondaryRateLimitHandler(retryAfter, options as RateLimitOptions);
          },
        },
      });
      tabInit(REPOS);
    } else {
      toggleLoader("none");
    }
  });
}

/**
 *
 * Filter Logics
 *
 */

// Function to filter the table based on search input
function filterTable() {
  const input = document.getElementById("searchInput") as HTMLInputElement;
  const value = input.value.toLowerCase();
  const filteredData = elemList.filter(
    (row) =>
      row.owner.toLowerCase().includes(value) ||
      row.repo.toLowerCase().includes(value) ||
      row.amount.toLowerCase().includes(value) ||
      row.tx.toLowerCase().includes(value) ||
      row.title.toLowerCase().includes(value) ||
      row.network.toLowerCase().includes(value) ||
      row.bounty_hunter.name.toLowerCase().includes(value)
  );
  resultTableTbodyElem.innerHTML = ""; // Clear the existing rows
  for (const data of filteredData) {
    const { owner, repo, id, network, tx, bounty_hunter, amount, title } = data as unknown as SavedData;
    populateTable(owner, repo, id, network, tx, title, amount, bounty_hunter);
  }
}

// Variables to track sorting
let sortDirection = 1; // 1 for ascending, -1 for descending

// Function to sort the table by the "Amount" column
function sortTableByAmount() {
  elemList.sort((a, b) => sortDirection * (Number(a.amount) - Number(b.amount)));
  sortDirection *= -1;
  updateSortArrow();
  resultTableTbodyElem.innerHTML = ""; // Clear the existing rows
  for (const data of elemList) {
    const { owner, repo, id, network, tx, bounty_hunter, amount, title } = data as unknown as SavedData;
    populateTable(owner, repo, id, network, tx, title, amount, bounty_hunter);
  }
}

// Function to update the sort arrow indicator
function updateSortArrow() {
  const sortArrow = document.getElementById("sortArrow") as HTMLElement;
  sortArrow.textContent = sortDirection === 1 ? "\u2191" : "\u2193";
}

const searchInput = document.getElementById("searchInput") as HTMLInputElement;
const amountHeader = document.getElementById("amountHeader") as HTMLTableCellElement;

// Add event listener for the search button
searchInput.addEventListener("keyup", filterTable);
// Add event listener for the "Amount" column header
amountHeader.addEventListener("click", sortTableByAmount);

auditInit();
