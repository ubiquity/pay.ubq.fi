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
interface Issue {
  id: number;
  node_id: string;
  node_type: string;
  updated: string;
  created: string;
  node_url: string;
  user_id: number;
  repository_id: number;
  organization_id: number;
  comment_id: number;
  issue_id: number;
  permit: {
    id: number;
    created: string;
    updated: string;
    amount: string;
    nonce: string;
    deadline: string;
    signature: string;
    token_id: number;
    partner_id: null;
    beneficiary_id: number;
    transaction: string;
    location_id: number;
    locations: {
      id: number;
      node_id: string;
      node_type: string;
      updated: string;
      created: string;
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
        updated: null;
        address: string;
        location_id: null;
      };
    };
    tokens: {
      id: number;
      created: string;
      updated: string;
      network: number;
      address: string;
      location_id: null;
    };
  } | null;
  owner: string;
  repo: string;
}
const issueList: Issue[] = [];

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
      c,
    } = this._queue.get(key) as StandardInterface;
    // check for undefined
    if (git?.issue_number) {
      elemList.push({
        id: git.issue_number,
        tx: ether?.txHash || TX_EMPTY_VALUE, // @TODO - handle this better
        amount: ethers.utils.formatEther(c?.amount || 0),
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
  try {
    const { data: gitData } = await octokit.rest.repos.get({
      owner,
      repo,
    });

    // Gets all the available issues for a given repository
    const { data: issues, error: locationError } = await supabase.from("issues_view").select("*").eq("repository_id", gitData?.id).not("issue_id", "is", null);
    if (locationError) {
      throw locationError;
    }
    const issueIds = issues?.map((o) => o.issue_id);

    // Gets all the permits that are referenced by that list of issues
    const { data: permits } = await supabase
      .from("permits")
      .select("*, locations(*), users(*, wallets(*)), tokens(*)")
      .in("locations.issue_id", issueIds)
      .not("locations", "is", null);

    // Eventually links the permit to the matching issue
    issues?.forEach((issue) => {
      issue.permit = permits?.find((o) => issue.issue_id === o.locations.issue_id) || null;
      issue.owner = owner;
      issue.repo = repo;
    });

    return issues as Issue[];
  } catch (error) {
    console.error(error);
    throw error;
  }
}

async function fetchPermits(repoUrls: GitHubUrlParts[]) {
  try {
    const issuePromises = repoUrls.map((repoUrl) => getPermitsForRepo(repoUrl.owner, repoUrl.repo));
    const allIssues = await Promise.all(issuePromises);

    for (let i = 0; i < allIssues.length; i++) {
      const issues = allIssues[i];
      issueList.push(...issues);
      console.log(`Fetched ${issues.length} issues for repository ${repoUrls[i].owner}/${repoUrls[i].repo}`);
    }
    for (const issue of issueList) {
      const { data: userData } = await octokit.request("GET /user/:id", { id: issue.user_id });
      const { node_url } = issue;
      const lastSlashIndex = node_url.lastIndexOf("/");
      const hashIndex = node_url.lastIndexOf("#") > 0 ? node_url.lastIndexOf("#") : node_url.length;
      const issueNumber = Number(node_url.substring(lastSlashIndex + 1, hashIndex));
      const { data: issueData } = await octokit.rest.issues.get({
        issue_number: issueNumber,
        owner: issue.owner,
        repo: issue.repo,
      });
      updateQueue.add(`${issue.id}`, {
        c: issue.permit
          ? {
              amount: issue.permit.amount,
              deadline: issue.permit.deadline,
              nonce: issue.permit.nonce,
              owner: issue.owner,
              signature: issue.permit.signature,
              to: issue.permit.users.wallets.address,
              token: issue.permit.tokens.address,
            }
          : null,
        k: issue.permit?.signature || "",
        s: {
          ether: undefined,
          git: {
            bounty_hunter: {
              name: userData.login,
              url: userData.html_url,
            },
            issue_number: issueData.number,
            issue_title: issueData.title,
            owner: issue.owner,
            repo: issue.repo,
          },
          network: issue.permit ? getCurrency(issue.permit.tokens.network) || Chain.Ethereum : Chain.Ethereum,
        },
        t: "git",
      });
    }
  } catch (error) {
    console.error(`Error fetching issues: ${error}`);
  }

  return issueList;
}

async function resetInit() {
  issueList.splice(0, issueList.length);
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
