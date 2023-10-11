import { ethers } from "ethers";
import { Octokit } from "@octokit/rest";
import { throttling } from "@octokit/plugin-throttling";
import axios from "axios";
import GoDB from "godb";
import { permit2Abi } from "../rewards/abis";
import { ObserverKeys, ElemInterface, QuickImport, StandardInterface, TxData, GoDBSchema, GitHubUrlParts, ChainScanResult, SavedData } from "./types";
import { Chain, ChainScan, DatabaseName, NULL_HASH, NULL_ID } from "./constants";
import { getCurrency, getGitHubUrlPartsArray, getRandomAPIKey, getRandomRpcUrl, isValidUrl, parseRepoUrl, populateTable, primaryRateLimitHandler, RateLimitOptions, secondaryRateLimitHandler } from "./helpers";
import { getTxInfo } from "./utils/getTransaction";

const rateOctokit = Octokit.plugin(throttling);

let BOT_WALLET_ADDRESS = "";
let REPOSITORY_URL = "";
let GITHUB_PAT = ""

let repoArray: string[] = [];

const urlRegex = /\((.*?)\)/;
const botNodeId = "BOT_kgDOBr8EgA";
const resultTableElem = document.querySelector("#resultTable") as HTMLElement;
const resultTableTbodyElem = document.querySelector("#resultTable tbody") as HTMLTableCellElement;
const getReportElem = document.querySelector("#getReport") as HTMLButtonElement;
const reportLoader = document.querySelector("#report-loader") as HTMLElement;
const tgBtnInput = document.querySelector("#cb4") as HTMLInputElement;

let isCache = true;

let isComment = true;
let commentPageNumber = 1;
const issueList: any[] = [];

const GIT_INTERVAL = 100;
let isGit = true;
let gitPageNumber = 1;
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

const getDataSchema = (storeHash: string) => {
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
};

const parseAndAddUrls = (input: string): void => {
  const urls = input.split(',').map((url) => url.trim());
  repoArray.push(...urls);
}

const updateDB = async (storeHash: string) => {
  const schema = getDataSchema(storeHash);
  const cacheDB = new GoDB(DatabaseName, schema);
  const metaTable = cacheDB.table(NULL_HASH);
  const storeTable = cacheDB.table(storeHash);

  const metaData = {
    id: storeHash as any,
    hash: lastEtherHash !== etherHash ? (lastEtherHash as string) : (etherHash as string),
    issue: lastGitID !== gitID ? (lastGitID as number) : (gitID as number),
  };

  await metaTable.put(metaData);
  if (elemList.length > 0) {
    for (let elem of elemList) {
      const { id, tx, amount, title, bounty_hunter, network, owner, repo } = elem;
      await storeTable.put({
        id,
        tx,
        amount,
        title,
        bounty_hunter,
        network,
        owner, 
        repo
      });
    }
  }
  await cacheDB.close();
  return;
};

const readDB = async (storeHash: string) => {
  const schema = getDataSchema(storeHash);
  const cacheDB = new GoDB(DatabaseName, schema);
  const storeTable = cacheDB.table(storeHash);
  const tableData = await storeTable.getAll();
  await cacheDB.close();
  return tableData;
};

const readMeta = async (storeHash: string) => {
  const schema = getDataSchema(storeHash);
  const cacheDB = new GoDB(DatabaseName, schema);
  const metaTable = cacheDB.table(NULL_HASH);
  const metaData = await metaTable.get({ id: storeHash });
  await cacheDB.close();
  return metaData;
};

const toggleLoader = (type: "none" | "block") => {
  getReportElem.disabled = type === "block" ? true : false;
  reportLoader.style.display = type;
};

class QueueObserver {
  private readonly queueObject: {
    isRPC: boolean;
    isComment: boolean;
    isGit: boolean;
    isEther: boolean;
  };
  private isException;

  constructor() {
    this.queueObject = {
      isRPC: false,
      isComment: false,
      isGit: false,
      isEther: false,
    };
    this.isException = false;
  }

  private databaseCallback() {
    const storeHash = ethers.utils.keccak256(ethers.utils.toUtf8Bytes(`${REPOSITORY_URL}_${BOT_WALLET_ADDRESS}`));
    updateDB(storeHash);
  }

  private callback() {
    toggleLoader("none");
    if (!this.isException) {
      this.databaseCallback();
    }
  }

  mutate(key: ObserverKeys, value: boolean) {
    this.queueObject[key] = value;
    const { isRPC: _isRPC, isComment: _isComment, isGit: _isGit, isEther: _isEther } = this.queueObject;
    const isUpdateFinished = _isRPC && _isComment && _isGit && _isEther;
    if (isUpdateFinished) {
      this.callback();
    }
  }

  clearQueue() {
    this.queueObject.isComment = false;
    this.queueObject.isEther = false;
    this.queueObject.isGit = false;
    this.queueObject.isRPC = false;
  }

  raise() {
    this.isException = true;
  }
}

const finishedQueue = new QueueObserver();

class smartQueue {
  private readonly queue: Map<string, StandardInterface>;

  constructor() {
    this.queue = new Map();
  }

  add(key: string, value: StandardInterface) {
    if (this.queue.has(key)) {
      const queueValue = this.queue.get(key) as StandardInterface;
      queueValue.s[value.t] = value.s[value.t] as any;
      const {
        s: { ether, git, network },
        c: { amount },
      } = queueValue;

      // check for undefined
      if(git?.issue_number) {
        elemList.push({
          id: git?.issue_number!,
          tx: ether?.txHash!,
          amount: ethers.utils.formatEther(amount)!,
          title: git?.issue_title!,
          bounty_hunter: git?.bounty_hunter,
          owner: git?.owner,
          repo: git?.repo,
          network,
        });
        if (elemList.length > 0) {
          resultTableTbodyElem.innerHTML = "";
          for (let data of elemList) {
            populateTable(data?.owner, data?.repo, data?.id, data?.network, data?.tx, data?.title, data?.amount, data?.bounty_hunter)
          }
        }
      }
      this.queue.delete(key);
    } else {
      this.queue.set(key, value);
    }
  }
}

class QueueSet {
  private readonly queue: any[];
  private readonly set: Set<any>;

  constructor() {
    this.queue = [];
    this.set = new Set();
  }

  add(item: any) {
    if (!this.set.has(item)) {
      this.set.add(item);
      this.queue.push(item);
    }
  }

  remove() {
    const v = this.queue.shift();
    this.set.delete(v);
  }

  read() {
    return this.queue[0];
  }

  isEmpty() {
    return this.queue.length === 0;
  }
}

const updateQueue = new smartQueue();
const rpcQueue = new QueueSet();

const commentFetcher = async () => {
  if (isComment) {
    const commentIntervalID = setInterval(async () => {
      clearInterval(commentIntervalID);
      try {
        if (issueList.length !== 0) {
          const octokit = new Octokit({
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
          let [owner, repo] = parseRepoUrl(issueList[0].html_url)
          const { data } = await octokit.rest.issues.listComments({
            owner,
            repo,
            issue_number: issueList[0].number,
            per_page: offset,
            page: commentPageNumber,
          });
          if (data.length === 0) {
            commentPageNumber = 1;
            await issueList.shift();
            if (issueList.length > 0) {
              commentFetcher();
            } else {
              isComment = false;
              finishedQueue.mutate("isComment", true);
            }
          } else {
            let isFound = false;
            for (let comment of data) {
              if(comment.user && comment.user.node_id === botNodeId && comment.body) {
                const match = comment.body.match(urlRegex);
                if (match && isValidUrl(match[1])) {
                  const url = new URL(match[1]);
                  const params = new URLSearchParams(url.search);
                  const base64Payload = params.get("claim");
                  let network = getCurrency(comment.body) // Might change it to `const claimNetwork = params.get("network");` later because previous permits are missing network query
                  if (base64Payload) {
                    const {
                      owner: ownerAddress,
                      signature,
                      permit: {
                        deadline,
                        nonce,
                        permitted: { amount, token },
                      },
                      transferDetails: { to },
                    } = JSON.parse(window.atob(base64Payload)) as TxData;
                    await updateQueue.add(signature, {
                      k: signature,
                      t: "git",
                      c: {
                        nonce,
                        owner: ownerAddress,
                        token,
                        amount,
                        to,
                        deadline,
                        signature,
                      },
                      s: {
                        git: {
                          issue_title: issueList[0].title,
                          issue_number: issueList[0].number,
                          owner,
                          repo,
                          bounty_hunter: {
                            name: issueList[0].assignee?.login,
                            url: issueList[0].assignee?.html_url
                          }
                        },
                        ether: undefined,
                        network: network as string,
                      },
                    });
                    isFound = true;
                  }
                } else {
                  console.log('URL not found, skipping');
                }
              }
            }

            if (isFound) {
              commentPageNumber = 1;
              await issueList.shift();
            } else {
              commentPageNumber++;
            }

            if (issueList.length > 0) {
              commentFetcher();
            } else {
              isComment = false;
              finishedQueue.mutate("isComment", true);
            }
          }
        } else {
          isComment = false;
          finishedQueue.mutate("isComment", true);
        }
      } catch (error) {
        console.error(error);
        finishedQueue.raise();
        await issueList.shift();
        if (issueList.length > 0) {
          commentFetcher();
        } else {
          isComment = false;
          finishedQueue.mutate("isComment", true);
        }
      }
    }, GIT_INTERVAL);
  }
};

const gitFetcher = async (repoUrls: GitHubUrlParts[]) => {
  if (isGit) {
    const octokit = new rateOctokit({
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

    const getIssuesForRepo = async (owner: string, repo: string) => {
      const issueList: any[] = [];

      while (true) {
        try {
          const { data } = await octokit.rest.issues.listForRepo({
            owner,
            repo,
            state: "closed",
            per_page: offset,
            page: gitPageNumber,
          });

          if (data.length === 0) break;

          const issues = data.filter((issue) => !issue.pull_request && issue.comments > 0);
          if (issues.length > 0) {
            if (!lastGitID) {
              lastGitID = issues[0].number;
            }
            let iEF = true;
            for (let i of issues) {
              if (i.number !== gitID) {
                await issueList.push(i);
              } else {
                iEF = false;
                break;
              }
            }

            if (iEF) {
              gitPageNumber++;
            } else {
              break;
            }
          } else {
            break;
          }
        } catch (error: any) {
          console.error(error);
          throw error;
        }
      }

      return issueList;
    };

    try {
      const issuesPromises = repoUrls.map((repoUrl) =>
        getIssuesForRepo(repoUrl.owner, repoUrl.repo)
      );
      const allIssues = await Promise.all(issuesPromises);

      for (let i = 0; i < allIssues.length; i++) {
        const issues = allIssues[i];
        issueList.push(...issues);
        console.log(
          `Fetched ${issues.length} issues for repository ${repoUrls[i].owner}/${repoUrls[i].repo}`
        );
      }

      isGit = false;
      finishedQueue.mutate("isGit", true);
      commentFetcher();
    } catch (error: any) {
      console.error("Error fetching issues:", error);
    }
  }
};

const fetchDataFromChainScanAPI = async (url: string, chain: string) => {
  try {
    const { data } = await axios.get(url);
    return data.result.map((item: any) => ({ ...item, chain }));
  } catch (error: any) {
    console.error(error);
    throw error;
  }
};

const etherFetcher = async () => {
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
        if (combinedData.length > 0) {
          if (!lastEtherHash) {
            lastEtherHash = combinedData[0].hash;
          }
          let iEF = true;
          for (let e of combinedData) {
            if (e.hash !== etherHash) {
              await rpcQueue.add({ hash: e.hash, chain: e.chain });
            } else {
              iEF = false;
              break;
            }
          }

          if (iEF) {
            etherPageNumber++;
            etherFetcher();
          } else {
            isEther = false;
            finishedQueue.mutate("isEther", true);
          }
        } else {
          isEther = false;
          finishedQueue.mutate("isEther", true);
        }
      } catch (error: any) {
        console.error(error);
        finishedQueue.raise();
        isEther = false;
        finishedQueue.mutate("isEther", true);
      }
    }, ETHER_INTERVAL);
  }
};

const rpcFetcher = async () => {
  if (isRPC) {
    const rpcIntervalID = setInterval(async () => {
      clearInterval(rpcIntervalID);
      try {
        const data = await rpcQueue.read();
        if (data) {
          const {hash, chain} = data

          const txInfo = await getTxInfo(hash, getRandomRpcUrl(chain),chain);

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
        await rpcQueue.remove();
        if (isEther || !rpcQueue.isEmpty()) {
          rpcFetcher();
        } else {
          isRPC = false;
          finishedQueue.mutate("isRPC", true);
        }
      } catch (error: any) {
        console.error(error);
        finishedQueue.raise();
        await rpcQueue.remove();
        if (isEther || !rpcQueue.isEmpty()) {
          rpcFetcher();
        } else {
          isRPC = false;
          finishedQueue.mutate("isRPC", true);
        }
      }
    }, RPC_INTERVAL);
  }
};

const dbInit = async () => {
  if (isCache) {
    const storeHash = ethers.utils.keccak256(ethers.utils.toUtf8Bytes(`${REPOSITORY_URL}_${BOT_WALLET_ADDRESS}`));
    const metaData = await readMeta(storeHash);

    if (metaData !== undefined) {
      const { hash, issue } = metaData;
      gitID = issue as number;
      etherHash = hash as string;

      const tableData = await readDB(storeHash);

      if (tableData.length > 0) {
        for (let data of tableData) {
          const {
            owner,
            repo,
            id,
            network,
            tx,
            bounty_hunter,
            amount,
            title,
          } =  data as unknown as SavedData
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
};

const resetInit = () => {
  isComment = true;
  commentPageNumber = 1;
  issueList.splice(0, issueList.length);
  isGit = true;
  gitPageNumber = 1;
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
};

const asyncInit = async () => {
  await resetInit();
  await dbInit();
};

const tabInit = (repoUrls: GitHubUrlParts[]) => {
  etherFetcher();
  gitFetcher(repoUrls);
  rpcFetcher();
};

const auditInit = () => {
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
      parseAndAddUrls(REPOSITORY_URL)
    } else {
      BOT_WALLET_ADDRESS = (document.querySelector("#botWalletAddress") as HTMLInputElement).value.toLocaleLowerCase();
      REPOSITORY_URL = (document.querySelector("#repoURLs") as HTMLInputElement).value.toLocaleLowerCase();
      GITHUB_PAT = (document.querySelector("#githubPAT") as HTMLInputElement).value;
      parseAndAddUrls(REPOSITORY_URL)
    }

    const REPOS = getGitHubUrlPartsArray(repoArray)

    if (
      BOT_WALLET_ADDRESS !== "" &&
      REPOSITORY_URL !== "" &&
      GITHUB_PAT !== "" &&
      REPOS.length > 0
    ) {
      await asyncInit();
      await tabInit(REPOS);
    } else {
      toggleLoader("none");
    }
  });
};

/**
 * 
 * Filter Logics
 * 
 */

// Function to filter the table based on search input
function filterTable() {
  const input = document.getElementById("searchInput")! as HTMLInputElement
  let value = input.value.toLowerCase();
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
  for (let data of filteredData) {
      const {
        owner,
        repo,
        id,
        network,
        tx,
        bounty_hunter,
        amount,
        title,
      } =  data as unknown as SavedData
      populateTable(owner, repo, id, network, tx, title, amount, bounty_hunter)
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
  for (let data of elemList) {
      const {
        owner,
        repo,
        id,
        network,
        tx,
        bounty_hunter,
        amount,
        title,
      } =  data as unknown as SavedData
      populateTable(owner, repo, id, network, tx, title, amount, bounty_hunter)
  }
}

// Function to update the sort arrow indicator
function updateSortArrow() {
  const sortArrow = document.getElementById("sortArrow") as HTMLElement;
  sortArrow.textContent = sortDirection === 1 ? "\u2191" : "\u2193";
}

// Add event listener for the search button
document.getElementById("searchInput")!.addEventListener("keyup", filterTable);

// Add event listener for the "Amount" column header
document.getElementById("amountHeader")!.addEventListener("click", sortTableByAmount);

auditInit();
