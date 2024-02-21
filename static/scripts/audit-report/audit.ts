import { throttling } from "@octokit/plugin-throttling";
import { Octokit } from "@octokit/rest";
import { createClient } from "@supabase/supabase-js";
import axios from "axios";
import { ethers } from "ethers";
import GoDB from "godb";
import { permit2Abi } from "../rewards/abis";
import { Chain, ChainScan, DATABASE_NAME, NULL_HASH, NULL_ID } from "./constants";
import {
  getCurrency,
  getGitHubUrlPartsArray,
  getOptimalRPC,
  getRandomAPIKey,
  populateTable,
  primaryRateLimitHandler,
  RateLimitOptions,
  secondaryRateLimitHandler,
} from "./helpers";
import {
  ChainScanResult,
  ElemInterface,
  EtherInterface,
  GitHubUrlParts,
  GitInterface,
  GoDBSchema,
  ObserverKeys,
  QuickImport,
  SavedData,
  StandardInterface,
  TxData,
} from "./types";
import { getTxInfo } from "./utils/getTransaction";

declare const SUPABASE_URL: string;
declare const SUPABASE_ANON_KEY: string;

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const rateOctokit = Octokit.plugin(throttling);

let octokit: Octokit;

let BOT_WALLET_ADDRESS = "";
let REPOSITORY_URL = "";
let GITHUB_PAT = "";

const repoArray: string[] = [];

const resultTableElem = document.querySelector("#resultTable") as HTMLElement;
const resultTableTbodyElem = document.querySelector("#resultTable tbody") as HTMLTableCellElement;
const getReportElem = document.querySelector("#getReport") as HTMLButtonElement;
const reportLoader = document.querySelector("#report-loader") as HTMLElement;
const tgBtnInput = document.querySelector("#cb4") as HTMLInputElement;

let isCache = true;

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

let isGit = true;
const offset = 100;

let isEther = true;
const ETHER_INTERVAL = 250;
let etherPageNumber = 1;

let isRPC = true;
const RPC_INTERVAL = 50;
const permit2Interface = new ethers.utils.Interface(permit2Abi);
const permitTransferFromSelector = "0x30f28b7a";
const permitFunctionName = "permitTransferFrom";
const elemList: ElemInterface[] = [];

let gitID = NULL_ID;
let etherHash = NULL_HASH;

let lastGitID: number | boolean = false;
let lastEtherHash: string | boolean = false;

function getDataSchema(storeHash: string) {
  const schema: GoDBSchema = {
    [NULL_HASH]: {
      id: {
        type: String,
        unique: true,
      },
      hash: {
        type: String,
        unique: false,
      },
      issue: {
        type: Number,
        unique: false,
      },
    },
    [storeHash]: {
      id: {
        type: Number,
        unique: true,
      },
      tx: {
        type: String,
        unique: false,
      },
      amount: {
        type: String,
        unique: false,
      },
      title: {
        type: String,
        unique: false,
      },
    },
  };

  return schema;
}

function parseAndAddUrls(input: string): void {
  const urls = input.split(",").map((url) => url.trim());
  repoArray.push(...urls);
}

async function updateDB(storeHash: string) {
  const schema = getDataSchema(storeHash);
  const cacheDB = new GoDB(DATABASE_NAME, schema);
  const metaTable = cacheDB.table(NULL_HASH);
  const storeTable = cacheDB.table(storeHash);

  const metaData = {
    // unknown as number because the only time it receives a string is initiating the db
    // and it is always a number after that according to the schema definition
    // [NULL_HASH]: id: storeHash<string>
    // [STORE_HASH]: id: storeHash<number>
    id: storeHash as unknown as number,
    hash: lastEtherHash !== etherHash ? (lastEtherHash as string) : (etherHash as string),
    issue: lastGitID !== gitID ? (lastGitID as number) : (gitID as number),
  };

  await metaTable.put(metaData);
  if (elemList.length > 0) {
    for (const elem of elemList) {
      const { id, tx, amount, title, bounty_hunter, network, owner, repo } = elem;
      await storeTable.put({
        id,
        tx,
        amount,
        title,
        bounty_hunter,
        network,
        owner,
        repo,
      });
    }
  }
  return cacheDB.close();
}

async function readDB(storeHash: string) {
  const schema = getDataSchema(storeHash);
  const cacheDB = new GoDB(DATABASE_NAME, schema);
  const storeTable = cacheDB.table(storeHash);
  const tableData = await storeTable.getAll();
  cacheDB.close();
  return tableData;
}

async function readMeta(storeHash: string) {
  const schema = getDataSchema(storeHash);
  const cacheDB = new GoDB(DATABASE_NAME, schema);
  const metaTable = cacheDB.table(NULL_HASH);
  const metaData = await metaTable.get({ id: storeHash });
  cacheDB.close();
  return metaData;
}

function toggleLoader(type: "none" | "block") {
  getReportElem.disabled = type === "block" ? true : false;
  reportLoader.style.display = type;
}

class QueueObserver {
  private readonly _queueObject: {
    isRPC: boolean;
    isComment: boolean;
    isGit: boolean;
    isEther: boolean;
  };
  private _isException;

  constructor() {
    this._queueObject = {
      isRPC: false,
      isComment: false,
      isGit: false,
      isEther: false,
    };
    this._isException = false;
  }

  private _databaseCallback() {
    const storeHash = ethers.utils.keccak256(ethers.utils.toUtf8Bytes(`${REPOSITORY_URL}_${BOT_WALLET_ADDRESS}`));
    updateDB(storeHash).catch((error) => console.error(error));
  }

  private _callback() {
    toggleLoader("none");
    if (!this._isException) {
      this._databaseCallback();
    }
  }

  mutate(key: ObserverKeys, value: boolean) {
    this._queueObject[key] = value;
    const { isRPC, isComment, isGit, isEther } = this._queueObject;
    const isUpdateFinished = isRPC && isComment && isGit && isEther;
    if (isUpdateFinished) {
      this._callback();
    }
  }

  clearQueue() {
    this._queueObject.isComment = false;
    this._queueObject.isEther = false;
    this._queueObject.isGit = false;
    this._queueObject.isRPC = false;
  }

  raise() {
    this._isException = true;
  }
}

const finishedQueue = new QueueObserver();

class SmartQueue {
  private readonly _queue: Map<string, StandardInterface>;

  constructor() {
    this._queue = new Map();
  }

  add(key: string, value: StandardInterface) {
    if (this._queue.has(key)) {
      const queueValue = this._queue.get(key) as StandardInterface;
      queueValue.s[value.t] = value.s[value.t] as object extends GitInterface ? GitInterface : object extends EtherInterface ? EtherInterface : never;
      const {
        s: { ether, git, network },
        c: { amount },
      } = queueValue;

      // check for undefined
      if (git?.issue_number) {
        elemList.push({
          id: git.issue_number,
          tx: ether?.txHash || "N/A", // @TODO - handle this better
          amount: ethers.utils.formatEther(amount),
          title: git.issue_title,
          bounty_hunter: git.bounty_hunter,
          owner: git.owner,
          repo: git.repo,
          network,
        });
        if (elemList.length > 0) {
          resultTableTbodyElem.innerHTML = "";
          for (const data of elemList) {
            populateTable(data?.owner, data?.repo, data?.id, data?.network, data?.tx, data?.title, data?.amount, data?.bounty_hunter);
          }
        }
      }
      this._queue.delete(key);
    } else {
      this._queue.set(key, value);
    }
  }
}
type QueueItem = ChainScanResult;
type Queue = QueueItem extends string ? string[] : QueueItem[];

class QueueSet {
  private readonly _queue: Queue;
  private readonly _set: Set<NonNullable<unknown>>;

  constructor() {
    this._queue = [];
    this._set = new Set();
  }

  add(item: NonNullable<unknown>) {
    if (!this._set.has(item)) {
      this._set.add(item);
      this._queue.push(item as QueueItem);
    }
  }

  remove() {
    const v = this._queue.shift();
    if (v) this._set.delete(v);
  }

  read(): ChainScanResult {
    return this._queue[0];
  }

  isEmpty() {
    return this._queue.length === 0;
  }
}

const updateQueue = new SmartQueue();
const rpcQueue = new QueueSet();

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

async function gitFetcher(repoUrls: GitHubUrlParts[]) {
  if (isGit) {
    try {
      const permitsPromises = repoUrls.map((repoUrl) => getPermitsForRepo(repoUrl.owner, repoUrl.repo));
      const allPermits = await Promise.all(permitsPromises);

      for (let i = 0; i < allPermits.length; i++) {
        const issues = allPermits[i];
        permitList.push(...issues);
        console.log(`Fetched ${issues.length} permits for repository ${repoUrls[i].owner}/${repoUrls[i].repo}`);
      }
      isGit = false;
      finishedQueue.mutate("isGit", true);
      for (const permit of permitList) {
        const { data: userData } = await octokit.request("GET /user/:id", { id: permit.locations.user_id });
        const { data } = await supabase.from("locations").select("*").eq("issue_id", permit.locations.issue_id).single();
        const lastSlashIndex = data.node_url.lastIndexOf("/");
        const hashIndex = data.node_url.lastIndexOf("#") || data.node_url.length;
        const issueNumber = Number(data.node_url.substring(lastSlashIndex + 1, hashIndex));
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
      finishedQueue.mutate("isComment", true);
    } catch (error) {
      console.error(`Error fetching issues: ${error}`);
      finishedQueue.mutate("isComment", true);
    }

    return permitList;
  }
}

async function fetchDataFromChainScanAPI(url: string, chain: string) {
  try {
    const { data } = await axios.get(url);
    return data.result.map((item: NonNullable<unknown>) => ({ ...item, chain }));
  } catch (error: unknown) {
    console.error(error);
    throw error;
  }
}

async function etherFetcher() {
  const ethereumURL = `https://api.${ChainScan.Ethereum}/api?module=account&action=tokentx&address=${BOT_WALLET_ADDRESS}&apikey=${getRandomAPIKey(
    Chain.Ethereum
  )}&page=${etherPageNumber}&offset=${offset}&sort=desc`;

  const gnosisURL = `https://api.${ChainScan.Gnosis}/api?module=account&action=tokentx&address=${BOT_WALLET_ADDRESS}&apikey=${getRandomAPIKey(
    Chain.Gnosis
  )}&page=${etherPageNumber}&offset=${offset}&sort=desc`;

  if (isEther) {
    const etherIntervalID = setInterval(async () => {
      clearInterval(etherIntervalID);
      try {
        const [ethereumData, gnosisData] = await Promise.all([
          fetchDataFromChainScanAPI(ethereumURL, Chain.Ethereum),
          fetchDataFromChainScanAPI(gnosisURL, Chain.Gnosis),
        ]);

        const combinedData: ChainScanResult[] = [...ethereumData, ...gnosisData];
        await handleCombinedData(combinedData);
      } catch (error: unknown) {
        console.error(error);
        finishedQueue.raise();
        isEther = false;
        finishedQueue.mutate("isEther", true);
      }
    }, ETHER_INTERVAL);
  }
}

async function handleCombinedData(combinedData: ChainScanResult[]) {
  if (combinedData.length > 0) {
    if (!lastEtherHash) {
      lastEtherHash = combinedData[0].hash;
    }
    let isIEF = true;
    for (const e of combinedData) {
      if (e.hash !== etherHash) {
        rpcQueue.add({ hash: e.hash, chain: e.chain });
      } else {
        isIEF = false;
        break;
      }
    }

    if (isIEF) {
      etherPageNumber++;
      await etherFetcher();
    } else {
      isEther = false;
      finishedQueue.mutate("isEther", true);
    }
  } else {
    isEther = false;
    finishedQueue.mutate("isEther", true);
  }
}

async function rpcFetcher() {
  if (isRPC) {
    const rpcIntervalID = setInterval(async () => {
      clearInterval(rpcIntervalID);
      try {
        const data = rpcQueue.read();
        await handleRPCData(data);
        rpcQueue.remove();
        if (isEther || !rpcQueue.isEmpty()) {
          await rpcFetcher();
        } else {
          isRPC = false;
          finishedQueue.mutate("isRPC", true);
        }
      } catch (error: unknown) {
        console.error(error);
        finishedQueue.raise();
        rpcQueue.remove();
        if (isEther || !rpcQueue.isEmpty()) {
          await rpcFetcher();
        } else {
          isRPC = false;
          finishedQueue.mutate("isRPC", true);
        }
      }
    }, RPC_INTERVAL);
  }
}

async function handleRPCData(data: ChainScanResult) {
  if (data) {
    const { hash, chain } = data as { hash: string; chain: string };
    const providerUrl = await getOptimalRPC(chain as Chain);
    const txInfo = await getTxInfo(hash, providerUrl, chain as Chain);

    if (txInfo.input.startsWith(permitTransferFromSelector)) {
      const decodedFunctionData = permit2Interface.decodeFunctionData(permitFunctionName, txInfo.input);
      const {
        permit: {
          permitted: { token, amount },
          nonce,
          deadline,
        },
        transferDetails: { to },
        owner,
        signature,
      } = decodedFunctionData as unknown as TxData;
      updateQueue.add(signature, {
        k: signature,
        t: "ether",
        c: {
          nonce,
          owner,
          token,
          amount,
          to,
          deadline,
          signature,
        },
        s: {
          ether: {
            txHash: txInfo.hash,
            timestamp: parseInt(txInfo.timestamp, 16),
            block_number: parseInt(txInfo.blockNumber, 16),
          },
          git: undefined,
          network: chain as string,
        },
      });
    }
  }
}

async function dbInit() {
  if (isCache) {
    const storeHash = ethers.utils.keccak256(ethers.utils.toUtf8Bytes(`${REPOSITORY_URL}_${BOT_WALLET_ADDRESS}`));
    const metaData = await readMeta(storeHash);

    if (metaData !== undefined) {
      const { hash, issue } = metaData;
      gitID = issue as number;
      etherHash = hash as string;

      const tableData = await readDB(storeHash);

      if (tableData.length > 0) {
        for (const data of tableData) {
          const { owner, repo, id, network, tx, bounty_hunter, amount, title } = data as unknown as SavedData;
          populateTable(owner, repo, id, network, tx, title, amount, bounty_hunter);
          // for filtering
          elemList.push({
            id,
            tx,
            amount,
            title,
            bounty_hunter,
            owner,
            repo,
            network,
          });
        }
      }
    }
  }
}

async function resetInit() {
  permitList.splice(0, permitList.length);
  isGit = true;
  isEther = true;
  etherPageNumber = 1;
  isRPC = true;
  elemList.splice(0, elemList.length);
  gitID = NULL_ID;
  etherHash = NULL_HASH;
  lastGitID = false;
  lastEtherHash = false;
  repoArray.splice(0, repoArray.length);
  finishedQueue.clearQueue();
}

async function asyncInit() {
  await resetInit();
  await dbInit();
}

function tabInit(repoUrls: GitHubUrlParts[]) {
  etherFetcher().catch((error) => console.error(error));
  gitFetcher(repoUrls).catch((error) => console.error(error));
  rpcFetcher().catch((error) => console.error(error));
}

function auditInit() {
  tgBtnInput.checked = true;
  getReportElem.addEventListener("click", async () => {
    isCache = tgBtnInput.checked;
    toggleLoader("block");
    resultTableElem.style.display = "table";
    resultTableTbodyElem.innerHTML = "";
    const quickImportValue = (document.querySelector("#quickName") as HTMLTextAreaElement).value;
    if (quickImportValue !== "") {
      const { WALLET, REPO, PAT }: QuickImport = JSON.parse(quickImportValue);
      BOT_WALLET_ADDRESS = WALLET.toLocaleLowerCase();
      REPOSITORY_URL = REPO.toLocaleLowerCase();
      GITHUB_PAT = PAT;
      parseAndAddUrls(REPOSITORY_URL);
    } else {
      BOT_WALLET_ADDRESS = (document.querySelector("#botWalletAddress") as HTMLInputElement).value.toLocaleLowerCase();
      REPOSITORY_URL = (document.querySelector("#repoURLs") as HTMLInputElement).value.toLocaleLowerCase();
      GITHUB_PAT = (document.querySelector("#githubPAT") as HTMLInputElement).value;
      parseAndAddUrls(REPOSITORY_URL);
    }

    const REPOS = getGitHubUrlPartsArray(repoArray);

    if (BOT_WALLET_ADDRESS !== "" && REPOSITORY_URL !== "" && GITHUB_PAT !== "" && REPOS.length > 0) {
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
