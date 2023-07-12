import { ethers } from "ethers";
import { Octokit } from "@octokit/rest";
import { throttling } from "@octokit/plugin-throttling";
import axios from "axios";
import * as rax from "retry-axios";
import GoDB from "godb";
import { permit2Abi } from "../devpool-claims/abis";
import { ObserverKeys, ElemInterface, QuickImport, StandardInterface, TxData, GoDBSchema } from "./types";

const interceptorID = rax.attach(axios);
const rateOctokit = Octokit.plugin(throttling);
let CHAINSCAN_API_KEY = "";
let RPC_URL = "";
let BOT_WALLET_ADDRESS = "";
let GITHUB_PERSONAL_ACCESS_TOKEN = "";
let OWNER_NAME = "";
let REPOSITORY_NAME = "";

enum ChainScan {
  Ethereum = "https://etherscan.io",
  Gnosis = "https://gnosisscan.io"
}

interface RateLimitOptions {
  method: string, url: string
}

const botNodeId = "BOT_kgDOBr8EgA";
const claimUrlRegExp = /https:\/\/pay\.ubq\.fi\?claim=[a-zA-Z0-9=]+/;
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

const NULL_ID = 0;
const NULL_HASH = "0x0000000000000000000000000000000000000000";
let gitID = NULL_ID;
let etherHash = NULL_HASH;

let lastGitID: number | boolean = false;
let lastEtherHash: string | boolean = false;

const DatabaseName = "file_cache";

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
      const { id, tx, amount, title } = elem;
      await storeTable.put({
        id,
        tx,
        amount,
        title,
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
    const storeHash = ethers.utils.keccak256(ethers.utils.toUtf8Bytes(`${OWNER_NAME}_${REPOSITORY_NAME}_${BOT_WALLET_ADDRESS}`));
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
        s: { ether, git },
        c: { amount },
      } = queueValue;
      const issue_url = `https://github.com/${OWNER_NAME}/${REPOSITORY_NAME}/issues/${git?.issue_number}`;
      const tx_url = `https://etherscan.io/tx/${ether?.txHash}`;
      const rows = `
        <tr>
            <td><a href="${issue_url}" target="_blank">#${git?.issue_number} - ${git?.issue_title}</a></td>
            <td><a href="${tx_url}" target="_blank">${ethers.utils.formatEther(amount)}</a></td>
        </tr>`;
      elemList.push({
        id: git?.issue_number!,
        tx: ether?.txHash!,
        amount: ethers.utils.formatEther(amount)!,
        title: git?.issue_title!,
      });

      resultTableTbodyElem.insertAdjacentHTML("beforeend", rows);
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

const primaryRateLimitHandler = (retryAfter: number, options: RateLimitOptions) => {
  console.warn(`Request quota exhausted for request ${options.method} ${options.url}\nRetrying after ${retryAfter} seconds!`);
  return true;
};

const secondaryRateLimitHandler = (retryAfter: number, options: RateLimitOptions) => {
  console.warn(`Secondary quota detected for request ${options.method} ${options.url}\nRetrying after ${retryAfter} seconds!`);
  return true;
};

const commentFetcher = async () => {
  if (isComment) {
    const commentIntervalID = setInterval(async () => {
      clearInterval(commentIntervalID);
      try {
        if (issueList.length !== 0) {
          const octokit = new Octokit({
            auth: GITHUB_PERSONAL_ACCESS_TOKEN,
            throttle: {
              onRateLimit: (retryAfter, options) => {
                return primaryRateLimitHandler(retryAfter, options as RateLimitOptions);
              },
              onSecondaryRateLimit: (retryAfter, options) => {
                return secondaryRateLimitHandler(retryAfter, options as RateLimitOptions);
              },
            },
          });
          const { data } = await octokit.rest.issues.listComments({
            owner: OWNER_NAME,
            repo: REPOSITORY_NAME,
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
              if (comment.user && comment.user.node_id === botNodeId && comment.body && claimUrlRegExp.test(comment.body)) {
                const base64Payload = comment.body.match(claimUrlRegExp)![0].replace("https://pay.ubq.fi?claim=", "");
                const {
                  owner,
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
                    owner,
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
                      owner: OWNER_NAME,
                      repo: REPOSITORY_NAME,
                    },
                    ether: undefined,
                  },
                });
                isFound = true;
                break;
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

const gitFetcher = async () => {
  if (isGit) {
    const gitIntervalID = setInterval(async () => {
      clearInterval(gitIntervalID);
      try {
        const octokit = new rateOctokit({
          auth: GITHUB_PERSONAL_ACCESS_TOKEN,
          throttle: {
            onRateLimit: (retryAfter, options) => {
              return primaryRateLimitHandler(retryAfter, options as RateLimitOptions);
            },
            onSecondaryRateLimit: (retryAfter, options) => {
              return secondaryRateLimitHandler(retryAfter, options as RateLimitOptions);
            },
          },
        });
        const { data } = await octokit.rest.issues.listForRepo({
          owner: OWNER_NAME,
          repo: REPOSITORY_NAME,
          state: "closed",
          per_page: offset,
          page: gitPageNumber,
        });
        if (data.length > 0) {
          const issues = await data.filter(issue => !issue.pull_request && issue.comments > 0);
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
            gitFetcher();
          } else {
            isGit = false;
            finishedQueue.mutate("isGit", true);
            commentFetcher();
          }
        } else {
          isGit = false;
          finishedQueue.mutate("isGit", true);
          commentFetcher();
        }
      } catch (error: any) {
        console.error(error);
        finishedQueue.raise();
        isGit = false;
        finishedQueue.mutate("isGit", true);
        commentFetcher();
      }
    }, GIT_INTERVAL);
  }
};

const etherFetcher = async () => {
  if (isEther) {
    const etherIntervalID = setInterval(async () => {
      clearInterval(etherIntervalID);
      try {
        const { data } = await axios.get(
          `https://api.etherscan.io/api?module=account&action=tokentx&address=${BOT_WALLET_ADDRESS}&apikey=${CHAINSCAN_API_KEY}&page=${etherPageNumber}&offset=${offset}&sort=desc`,
        );
        if (data.result.length > 0) {
          if (!lastEtherHash) {
            lastEtherHash = data.result[0].hash;
          }
          let iEF = true;
          for (let e of data.result) {
            if (e.hash !== etherHash) {
              await rpcQueue.add(e.hash);
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
        const txHash = await rpcQueue.read();
        if (txHash) {
          const provider = new ethers.providers.JsonRpcProvider(RPC_URL);
          const txInfo = await provider.getTransaction(txHash);

          if (txInfo.data.startsWith(permitTransferFromSelector)) {
            const decodedFunctionData = permit2Interface.decodeFunctionData(permitFunctionName, txInfo.data);
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
                  txHash: txInfo.hash as string,
                  timestamp: txInfo.timestamp as number,
                  block_number: txInfo.blockNumber as number,
                },
                git: undefined,
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
    const storeHash = ethers.utils.keccak256(ethers.utils.toUtf8Bytes(`${OWNER_NAME}_${REPOSITORY_NAME}_${BOT_WALLET_ADDRESS}`));
    const metaData = await readMeta(storeHash);

    if (metaData !== undefined) {
      const { hash, issue } = metaData;
      gitID = issue as number;
      etherHash = hash as string;

      const tableData = await readDB(storeHash);

      if (tableData.length > 0) {
        for (let data of tableData) {
          const issue_url = `https://github.com/${OWNER_NAME}/${REPOSITORY_NAME}/issues/${data.id}`;
          const tx_url = `https://etherscan.io/tx/${data.tx}`;
          const rows = `
          <tr>
              <td><a href="${issue_url}" target="_blank">#${data.id} - ${data.title}</a></td>
              <td><a href="${tx_url}" target="_blank">${data.amount}</a></td>
          </tr>`;
          resultTableTbodyElem.insertAdjacentHTML("beforeend", rows);
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
};

const asyncInit = async () => {
  await resetInit();
  await dbInit();
};

const tabInit = () => {
  etherFetcher();
  gitFetcher();
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
      const { API, RPC, WALLET, PAT, OWNER, REPO }: QuickImport = JSON.parse(quickImportValue);
      CHAINSCAN_API_KEY = API;
      RPC_URL = RPC;
      BOT_WALLET_ADDRESS = WALLET.toLocaleLowerCase();
      GITHUB_PERSONAL_ACCESS_TOKEN = PAT;
      OWNER_NAME = OWNER.toLocaleLowerCase();
      REPOSITORY_NAME = REPO.toLocaleLowerCase();
    } else {
      CHAINSCAN_API_KEY = (document.querySelector("#chainscanApiKey") as HTMLInputElement).value;
      RPC_URL = (document.querySelector("#rpcUrl") as HTMLInputElement).value;
      BOT_WALLET_ADDRESS = (document.querySelector("#botWalletAddress") as HTMLInputElement).value.toLocaleLowerCase();
      GITHUB_PERSONAL_ACCESS_TOKEN = (document.querySelector("#githubPat") as HTMLInputElement).value;
      OWNER_NAME = (document.querySelector("#ownerName") as HTMLInputElement).value.toLocaleLowerCase();
      REPOSITORY_NAME = (document.querySelector("#repoName") as HTMLInputElement).value.toLocaleLowerCase();
    }

    if (
      CHAINSCAN_API_KEY !== "" &&
      RPC_URL !== "" &&
      BOT_WALLET_ADDRESS !== "" &&
      GITHUB_PERSONAL_ACCESS_TOKEN !== "" &&
      OWNER_NAME !== "" &&
      REPOSITORY_NAME !== ""
    ) {
      await asyncInit();
      await tabInit();
    } else {
      toggleLoader("none");
    }
  });
};

auditInit();
