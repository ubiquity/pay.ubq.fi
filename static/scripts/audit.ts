import { ethers } from "ethers";
import { Octokit } from "@octokit/rest";
import { permit2Abi } from "./abis";

let ETHERSCAN_API_KEY = ""; // 5 requests per second
let RPC_URL = "";
let BOT_WALLET_ADDRESS = "";
let GITHUB_PERSONAL_ACCESS_TOKEN = ""; // PAT with "repo" scope
let OWNER_NAME = "";
let REPOSITORY_NAME = "";

interface QuickImport {
  API: string;
  RPC: string;
  WALLET: string;
  PAT: string;
  OWNER: string;
  REPO: string;
}

/**
 * Inserts a log string into html
 */
const log = async (msg: string) => {
  const logElem = document.querySelector("#log") as Element;
  logElem.innerHTML = msg;
};

// TODO: etherscan pagination
// TODO: handle errors
// TODO: retry on rate limit
// TODO: cache responses in local storage
const getTableItems = async () => {
  let results: any[] = [];

  try {
    // get all TXs for wallet address
    const walletTxsRaw = await fetch(`https://api.etherscan.io/api?module=account&action=tokentx&address=${BOT_WALLET_ADDRESS}&apikey=${ETHERSCAN_API_KEY}`);
    const walletTxs = (await walletTxsRaw.json()).result;

    // prepare RPC provider for getting TX data
    const provider = new ethers.providers.JsonRpcProvider(RPC_URL);
    // prepare permit2 ABI
    const permit2Interface = new ethers.utils.Interface(permit2Abi);
    const permitTransferFromSelector = "0x30f28b7a";
    // for all TXs decode data and add to TX object
    for (let walletTx of walletTxs) {
      // get TX info
      log(`Getting tx info for hash: ${walletTx.hash}`);
      const txInfo = await provider.getTransaction(walletTx.hash);
      // if TX is not calling "permitTransferFrom" then skip it
      if (txInfo.data.substring(0, 10) !== permitTransferFromSelector) continue;
      // decode TX data
      const decodedTxData = permit2Interface.decodeFunctionData("permitTransferFrom", txInfo.data);
      // apply decoded TX data to wallet TX
      walletTx.decodedData = decodedTxData;
    }

    // init octokit
    const octokit = new Octokit({ auth: GITHUB_PERSONAL_ACCESS_TOKEN });
    const botNodeId = "BOT_kgDOBr8EgA";
    // get all closed issues (in terms of github API a pull request is also an issue)
    let { data: issues } = await octokit.rest.issues.listForRepo({
      owner: OWNER_NAME,
      repo: REPOSITORY_NAME,
      headers: {
        "X-GitHub-Api-Version": "2022-11-28",
      },
      state: "closed",
      per_page: 100,
    });
    // remove PRs from the issues and find issues with at least 1 comment
    issues = issues.filter((issue: any) => !issue.pull_request && issue.comments > 0);
    // for each closed issue
    for (let issue of issues) {
      // prepare result item
      const xIssue: any = issue;
      let resultItem = {
        issueUrl: xIssue.html_url,
        txUrl: "",
        amount: "",
      };
      // get issue comments
      log(`Getting comments for issue: ${xIssue.number}`);
      const { data: comments } = await octokit.rest.issues.listComments({
        owner: OWNER_NAME,
        repo: REPOSITORY_NAME,
        issue_number: xIssue.number,
        headers: {
          "X-GitHub-Api-Version": "2022-11-28",
        },
      });
      // for each comment
      for (let comment of comments) {
        const xComment: any = comment;
        // if author is the ubiquity bot and the comment contains a claim URL
        const claimUrlRegExp = /https:\/\/pay\.ubq\.fi\?claim=[a-zA-Z0-9=]+/;
        if (xComment.user.node_id == botNodeId && claimUrlRegExp.test(xComment.body)) {
          // get base64 payload
          const base64Payload = xComment.body.match(claimUrlRegExp)[0].replace("https://pay.ubq.fi?claim=", "");
          const payload = JSON.parse(window.atob(base64Payload));
          // find matching TX
          const matchingTxs = walletTxs.filter(walletTx => walletTx.decodedData && walletTx.decodedData.permit.nonce.toString() === payload.permit.nonce);
          if (matchingTxs.length > 0) {
            resultItem.txUrl = `https://etherscan.io/tx/${matchingTxs[0].hash}`;
            resultItem.amount = ethers.utils.formatEther(payload.transferDetails.requestedAmount.toString());
          }
          break;
        }
      }
      // add result item
      results.push(resultItem);
    }
  } catch (err) {
    alert(err);
    console.error(err);
  }

  return results;
};

export const auditInit = async () => {
  /**
   * On "get report" btn click
   */

  const getReportElem = document.querySelector("#getReport") as Element;

  getReportElem.addEventListener("click", async () => {
    // get constants from inputs
    const quickImportValue = (document.querySelector("#quickName") as HTMLTextAreaElement).value;
    if (quickImportValue !== "") {
      const { API, RPC, WALLET, PAT, OWNER, REPO }: QuickImport = JSON.parse(quickImportValue);
      ETHERSCAN_API_KEY = API;
      RPC_URL = RPC;
      BOT_WALLET_ADDRESS = WALLET;
      GITHUB_PERSONAL_ACCESS_TOKEN = PAT;
      OWNER_NAME = OWNER;
      REPOSITORY_NAME = REPO;
    } else {
      ETHERSCAN_API_KEY = (document.querySelector("#etherscanApiKey") as HTMLInputElement).value;
      RPC_URL = (document.querySelector("#rpcUrl") as HTMLInputElement).value;
      BOT_WALLET_ADDRESS = (document.querySelector("#botWalletAddress") as HTMLInputElement).value;
      GITHUB_PERSONAL_ACCESS_TOKEN = (document.querySelector("#githubPat") as HTMLInputElement).value;
      OWNER_NAME = (document.querySelector("#ownerName") as HTMLInputElement).value;
      REPOSITORY_NAME = (document.querySelector("#repoName") as HTMLInputElement).value;
    }
    // hide result table
    const resultTableElem = document.querySelector("#resultTable") as HTMLElement;
    resultTableElem.style.display = "none";
    // show loader
    const loaderElem = document.querySelector("#loader") as HTMLElement;
    loaderElem.style.display = "block";
    // get table items
    const tableItems = await getTableItems();
    // insert table rows
    let rowsHtml = "";
    for (let tableItem of tableItems) {
      rowsHtml += `
                        <tr>
                            <td><a href="${tableItem.issueUrl}" target="_blank">${tableItem.issueUrl}</a></td>
                            <td><a href="${tableItem.txUrl}" target="_blank">${tableItem.txUrl}</a></td>
                            <td>${tableItem.amount}</td>
                        </tr>
                    `;
    }
    const resultTableTbodyElem = document.querySelector("#resultTable tbody") as Element;
    resultTableTbodyElem.innerHTML = rowsHtml;
    // hide loader
    loaderElem.style.display = "none";
    // show result table
    resultTableElem.style.display = "table";
  });
};

auditInit();
