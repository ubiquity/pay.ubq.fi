import { JsonRpcSigner } from "@ethersproject/providers";
import { createOrUpdateTextFile } from "@octokit/plugin-create-or-update-text-file";
import { Octokit } from "@octokit/rest";
import { PERMIT2_ADDRESS } from "@uniswap/permit2-sdk";
import { ethers } from "ethers";
import { parseUnits } from "ethers/lib/utils";
import _sodium from "libsodium-wrappers";
import YAML from "yaml";
import { BotConfig } from "../../../lib/ubiquibot/src/types/configuration-types";
import { erc20Abi } from "../rewards/abis/erc20Abi";
import { getNetworkName, NetworkIds, Tokens } from "../rewards/constants";

const classes = ["error", "warn", "success"];
const inputClasses = ["input-warn", "input-error", "input-success"];
const outKey = document.getElementById("outKey") as HTMLInputElement;
const githubPAT = document.getElementById("githubPat") as HTMLInputElement;
const orgName = document.getElementById("orgName") as HTMLInputElement;
const walletPrivateKey = document.getElementById("walletPrivateKey") as HTMLInputElement;
// cspell: word ress // weird cspell bug seperating add and ress
const setBtn = document.getElementById("setBtn") as HTMLButtonElement;
const allowanceInput = document.getElementById("allowance") as HTMLInputElement;
const chainIdSelect = document.getElementById("chainId") as HTMLSelectElement;
const loader = document.querySelector(".loader-wrap") as HTMLElement;

const APP_ID = 236521;
const REPO_NAME = "ubiquibot-config";
const KEY_PATH = ".github/ubiquibot-config.yml";
const PRIVATE_ENCRYPTED_KEY_NAME = "evmPrivateEncrypted";
const EVM_NETWORK_KEY_NAME = "evmNetworkId";
const KEY_PREFIX = "HSK_";
// cspell:disable-next-line
const X25519_KEY = "5ghIlfGjz_ChcYlBDOG7dzmgAgBPuTahpvTMBipSH00";
const STATUS_LOG = ".status-log";

let encryptedValue = "";

const defaultConf = {} as BotConfig;

export async function parseYAML<T>(data: string | undefined) {
  if (!data) return undefined;
  try {
    const parsedData = await YAML.parse(data);
    if (parsedData !== null) {
      return parsedData as T;
    } else {
      return undefined;
    }
  } catch (error) {
    return undefined;
  }
}

export async function parseJSON<T>(data: string) {
  try {
    const parsedData = await JSON.parse(data);
    return parsedData as T;
  } catch (error) {
    return undefined;
  }
}

export function stringifyYAML(value: BotConfig): string {
  return YAML.stringify(value, { defaultKeyType: "PLAIN", defaultStringType: "QUOTE_DOUBLE", lineWidth: 0 });
}

export async function getConf(): Promise<string | undefined> {
  try {
    const octokit = new Octokit({ auth: githubPAT.value });
    const { data } = await octokit.rest.repos.getContent({
      owner: orgName.value,
      repo: REPO_NAME,
      path: KEY_PATH,
      mediaType: {
        format: "raw",
      },
    });
    return data as unknown as string;
  } catch (error: unknown) {
    return undefined;
  }
}

function getTextBox(text: string) {
  const strLen = text.split("\n").length * 22;
  return `${strLen > 140 ? strLen : 140}px`;
}

function resetToggle() {
  (walletPrivateKey.parentNode?.querySelector(STATUS_LOG) as HTMLElement).innerHTML = "";
  (githubPAT.parentNode?.querySelector(STATUS_LOG) as HTMLElement).innerHTML = "";
  (orgName.parentNode?.querySelector(STATUS_LOG) as HTMLElement).innerHTML = "";
}

function classListToggle(targetElem: HTMLElement, target: "error" | "warn" | "success", inputElem?: HTMLInputElement | HTMLTextAreaElement) {
  classes.forEach((className) => targetElem.classList.remove(className));
  targetElem.classList.add(target);

  if (inputElem) {
    inputClasses.forEach((className) => inputElem.classList.remove(className));
    inputElem.classList.add(`input-${target}`);
  }
}

function statusToggle(type: "error" | "warn" | "success", message: string) {
  resetToggle();
  const statusKey = document.getElementById("statusKey") as HTMLInputElement;
  classListToggle(statusKey, type);
  statusKey.value = message;
}

function focusToggle(targetElem: HTMLInputElement | HTMLTextAreaElement, type: "error" | "warn" | "success", message: string) {
  resetToggle();
  const infoElem = targetElem.parentNode?.querySelector(STATUS_LOG) as HTMLElement;
  infoElem.innerHTML = message;
  classListToggle(infoElem, type, targetElem);
  targetElem.focus();
}

function toggleLoader(state: "start" | "end") {
  if (state === "start") {
    setBtn.disabled = true;
    loader.style.display = "flex";
  } else {
    setBtn.disabled = false;
    loader.style.display = "none";
  }
}

function singleToggle(type: "error" | "warn" | "success", message: string, focusElem?: HTMLInputElement | HTMLTextAreaElement) {
  statusToggle(type, message);

  if (focusElem) {
    focusToggle(focusElem, type, message);
  }

  toggleLoader("end");
}

async function sodiumEncryptedSeal(publicKey: string, secret: string) {
  outKey.value = "";
  encryptedValue = "";
  try {
    await _sodium.ready;
    const sodium = _sodium;

    const binkey = sodium.from_base64(publicKey, sodium.base64_variants.URLSAFE_NO_PADDING);
    const binsec = sodium.from_string(secret);
    const encBytes = sodium.crypto_box_seal(binsec, binkey);
    const output = sodium.to_base64(encBytes, sodium.base64_variants.URLSAFE_NO_PADDING);
    defaultConf.keys[PRIVATE_ENCRYPTED_KEY_NAME] = output;
    defaultConf.payments[EVM_NETWORK_KEY_NAME] = Number(chainIdSelect.value);
    outKey.value = stringifyYAML(defaultConf);
    outKey.style.height = getTextBox(outKey.value);
    encryptedValue = output;
    singleToggle("success", `Success: Key Encryption is ok.`);
  } catch (error: unknown) {
    if (error instanceof Error) {
      console.error(error);
      singleToggle("error", `Error: ${error.message}`);
    }
  }
}

async function setConfig() {
  try {
    toggleLoader("start");
    const pluginKit = Octokit.plugin(createOrUpdateTextFile);
    const octokit = new pluginKit({ auth: githubPAT.value });
    const { data: userInfo } = await octokit.rest.users.getByUsername({
      username: orgName.value,
    });
    if (userInfo.type === "Organization") {
      const repositoryId = await getRepoID(octokit, orgName.value, REPO_NAME);

      const { data: appInstallations } = await octokit.rest.orgs.listAppInstallations({
        org: orgName.value,
        per_page: 100,
      });
      const ins = appInstallations.installations.filter((installation) => installation.app_id === APP_ID);

      await handleInstall(octokit, orgName, repositoryId, ins, chainIdSelect);
    } else {
      singleToggle("error", `Error: Not an organization.`, orgName);
    }
  } catch (error) {
    if (!(error instanceof Error)) {
      return console.error(error);
    }
    console.error(error);
    singleToggle("error", `Error: ${error.message}`);
  }
}

async function handleInstall(
  octokit: Octokit,
  orgName: HTMLInputElement,
  repositoryId: number | null,
  ins: { id: number }[],
  chainIdSelect: HTMLSelectElement
) {
  if (ins.length > 0) {
    const installationId = ins[0].id;
    const { data: installedRepos } = await octokit.rest.apps.listInstallationReposForAuthenticatedUser({
      installation_id: installationId,
    });
    const irs = installedRepos.repositories.filter((installedRepo) => installedRepo.id === repositoryId);

    if (irs.length === 0) {
      if (!repositoryId) {
        singleToggle("error", `Error: Repo initialization failed, try again later.`);
        return;
      }
      await octokit.rest.apps.addRepoToInstallationForAuthenticatedUser({
        installation_id: installationId,
        repository_id: repositoryId,
      });
    }

    const conf = await getConf();

    const updatedConf = defaultConf;
    const parsedConf = await parseYAML<BotConfig>(conf);
    updatedConf.keys[PRIVATE_ENCRYPTED_KEY_NAME] = encryptedValue;
    updatedConf.payments[EVM_NETWORK_KEY_NAME] = Number(chainIdSelect.value);

    // combine configs (default + remote org wide)
    const combinedConf = Object.assign(updatedConf, parsedConf);

    const stringified = stringifyYAML(combinedConf);
    outKey.value = stringified;
    const { status } = await octokit.repos.createOrUpdateFileContents({
      owner: orgName.value,
      repo: REPO_NAME,
      path: KEY_PATH,
      content: stringified,
      message: `${crypto.randomUUID()}`,
    });

    if (status === 201 || status === 200) {
      singleToggle("success", `Success: private key is updated.`);
    } else {
      singleToggle("success", `Success: private key is upto date.`);
    }

    await nextStep();
  } else {
    singleToggle("warn", `Warn: Please install the app first.`);
  }
}

async function getRepoID(octokit: Octokit, orgName: string, repoName: string): Promise<number | null> {
  let repositoryId: number | null = null;

  try {
    const { data: repositoryInfo } = await octokit.rest.repos.get({
      owner: orgName,
      repo: repoName,
    });
    repositoryId = repositoryInfo.id;
  } catch (error) {
    if (!(error instanceof Error)) {
      console.error(error);
      return null;
    }

    console.error(error.message);
    try {
      const { data: repoRes } = await octokit.rest.repos.createInOrg({
        org: orgName,
        name: repoName,
        auto_init: true,
        private: true,
        visibility: "private",
        has_downloads: true,
      });
      repositoryId = repoRes.id;
    } catch (error) {
      if (!(error instanceof Error)) {
        console.error(error);
        return null;
      }
      console.error(error.message);
      singleToggle("error", `Error: Repo initialization failed, try again later.`);
      return null;
    }
  }
  return repositoryId;
}

function setInputListeners() {
  const inputs = document.querySelectorAll("input") as NodeListOf<HTMLInputElement>;

  inputs.forEach((input) => {
    input.addEventListener("input", (e) => {
      inputClasses.forEach((className) => (e.target as HTMLInputElement).classList.remove(className));
      (((e.target as HTMLInputElement).parentNode as HTMLElement).querySelector(STATUS_LOG) as HTMLElement).innerHTML = "";
    });
  });
}

let currentStep = 1;
let signer: JsonRpcSigner | undefined = undefined;

async function nextStep() {
  const configChainId = Number(chainIdSelect.value);

  const tokenNameSpan = document.getElementById("allowance + span");
  if (tokenNameSpan) {
    if (configChainId === NetworkIds.Mainnet) {
      tokenNameSpan.innerHTML = "DAI";
    } else if (configChainId === NetworkIds.Gnosis) {
      tokenNameSpan.innerHTML = "WXDAI";
    }
  }

  const step1 = document.getElementById("step1") as HTMLElement;
  step1.classList.add("hidden");
  const step2 = document.getElementById("step2") as HTMLElement;
  step2.classList.remove("hidden");
  const stepper = document.getElementById("stepper") as HTMLElement;
  const steps = stepper.querySelectorAll("div.step");
  steps[0].classList.remove("active");
  steps[1].classList.add("active");
  setBtn.innerText = "Approve";
  currentStep = 2;

  if (!window.ethereum) {
    singleToggle("error", `Error: Please install MetaMask or any other Ethereum wallet.`);
    return;
  }

  const provider = new ethers.providers.Web3Provider(window.ethereum);
  signer = await connectWallet();
  if (!signer) {
    singleToggle("error", `Error: Please connect to MetaMask.`);
    return;
  }

  const currentChainId = await signer.getChainId();

  if (configChainId !== currentChainId) {
    singleToggle("error", `Error: Please connect to ${getNetworkName(configChainId)}.`);
    if (await switchNetwork(provider, configChainId)) {
      singleToggle("success", ``);
    }
  }

  // watch for chain changes             making this generic suppresses the unknown comparison
  window.ethereum.on("chainChanged", async <T>(currentChainId: T | string) => {
    if (configChainId === parseInt(currentChainId as string, 16)) {
      singleToggle("success", ``);
    } else {
      singleToggle("error", `Error: Please connect to ${getNetworkName(configChainId)}.`);
      switchNetwork(provider, configChainId).catch((error) => {
        console.error(error);
      });
    }
  });
}

async function connectWallet(): Promise<JsonRpcSigner | undefined> {
  try {
    const provider = new ethers.providers.Web3Provider(window.ethereum, "any");
    await provider.send("eth_requestAccounts", []);
    return provider.getSigner();
  } catch (error: unknown) {
    if (error instanceof Error) {
      if (error?.message?.includes("missing provider")) {
        singleToggle("error", "Error: Please install MetaMask.");
      } else {
        singleToggle("error", "Error: Please connect your wallet.");
      }
      return undefined;
    }
  }
}

async function switchNetwork(provider: ethers.providers.Web3Provider, chainId: string | number): Promise<boolean> {
  try {
    // if chainId is a number then convert it to hex
    if (typeof chainId === "number") {
      chainId = `0x${chainId.toString(16)}`;
    }
    // if chainId is a string but doesn't start with 0x then convert it to hex
    if (typeof chainId === "string" && !chainId.startsWith("0x")) {
      chainId = `0x${Number(chainId).toString(16)}`;
    }
    await provider.send("wallet_switchEthereumChain", [{ chainId: chainId }]);
    return true;
  } catch (error: unknown) {
    return false;
  }
}

function isHex(str: string): boolean {
  const regexp = /^[0-9a-fA-F]+$/;
  return regexp.test(str);
}

async function step1Handler() {
  if (walletPrivateKey.value === "") {
    singleToggle("warn", `Warn: Private_Key is not set.`, walletPrivateKey);
    return;
  }
  if (!isHex(walletPrivateKey.value)) {
    singleToggle("warn", `Warn: Private_Key is not a valid hex string.`, walletPrivateKey);
    return;
  }
  if (walletPrivateKey.value.length !== 64) {
    singleToggle("warn", `Warn: Private_Key must be 32 bytes long.`, walletPrivateKey);
    return;
  }
  if (orgName.value === "") {
    singleToggle("warn", `Warn: Org Name is not set.`, orgName);
    return;
  }
  if (githubPAT.value === "") {
    singleToggle("warn", `Warn: GitHub PAT is not set.`, githubPAT);
    return;
  }

  await sodiumEncryptedSeal(X25519_KEY, `${KEY_PREFIX}${walletPrivateKey.value}`);
  setConfig().catch((error) => {
    console.error(error);
  });
}

async function step2Handler() {
  try {
    if (!window.ethereum) {
      singleToggle("error", `Error: Please install MetaMask or any other Ethereum wallet.`);
      return;
    }

    const provider = new ethers.providers.Web3Provider(window.ethereum);

    // if wallet is still not connected then retry connecting
    if (!signer) {
      signer = await connectWallet();
      if (!signer) {
        singleToggle("error", `Error: Please connect to MetaMask.`);
        return;
      }
    }

    const walletChainId = await signer.getChainId();
    const configChainId = Number(chainIdSelect.value);

    window.ethereum.on("chainChanged", async <T>(currentChainId: T | string) => {
      if (configChainId === parseInt(currentChainId as string, 16)) {
        singleToggle("success", ``);
      } else {
        singleToggle("error", `Error: Please connect to ${chainIdSelect.value}.`);
        switchNetwork(provider, configChainId).catch((error) => {
          console.error(error);
        });
      }
    });

    if (walletChainId !== configChainId && !(await switchNetwork(provider, configChainId))) {
      singleToggle("error", `Error: Switch to the correct chain.`);
      return;
    }

    // load token contract
    let token = "";
    if (configChainId === NetworkIds.Mainnet) {
      token = Tokens.DAI;
    } else if (configChainId === NetworkIds.Gnosis) {
      token = Tokens.WXDAI;
    }
    const erc20 = new ethers.Contract(token, erc20Abi, signer);
    const decimals = await erc20.decimals();
    const allowance = Number(allowanceInput.value);
    if (allowance <= 0) {
      singleToggle("error", `Error: Allowance should be greater than 0.`);
      return;
    }

    await erc20.approve(PERMIT2_ADDRESS, parseUnits(allowance.toString(), decimals));
    singleToggle("success", `Success`);
  } catch (error: unknown) {
    if (error instanceof Error) {
      console.error(error);
      singleToggle("error", `Error: ${error.message}`);
    }
  }
}

async function init() {
  if (defaultConf !== undefined) {
    try {
      defaultConf.keys[PRIVATE_ENCRYPTED_KEY_NAME] = undefined;
      setInputListeners();

      setBtn.addEventListener("click", async () => {
        if (currentStep === 1) {
          await step1Handler();
        } else if (currentStep === 2) {
          await step2Handler();
        }
      });
    } catch (error) {
      console.error(error);
    }
  } else {
    throw new Error("Default config fetch failed");
  }
}

init().catch((error) => {
  console.error(error);
});
