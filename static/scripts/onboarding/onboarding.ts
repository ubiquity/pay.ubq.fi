import _sodium from "libsodium-wrappers";
import { Octokit } from "@octokit/rest";
import { createOrUpdateTextFile } from "@octokit/plugin-create-or-update-text-file";
import YAML from "yaml";
import { ethers } from "ethers";
import { PERMIT2_ADDRESS } from "@uniswap/permit2-sdk";
import { JsonRpcSigner, Network } from "@ethersproject/providers";
import { parseUnits } from "ethers/lib/utils";
import { NetworkIds, Tokens, getNetworkName, networkNames } from "../rewards/constants";
import { daiAbi } from "../rewards/abis/daiAbi";
import { allowanceInput, chainIdSelect, connectWallet, githubPAT, inputClasses, orgName, outKey, safeAddressInput, setBtn, singleToggle, toggleLoader, walletPrivateKey } from "../helpers";

const APP_ID = 236521;
const REPO_NAME = "ubiquibot-config";
const KEY_PATH = ".github/ubiquibot-config.yml";
const KEY_NAME = "private-key-encrypted";
const KEY_PREFIX = "HSK_";
const X25519_KEY = "5ghIlfGjz_ChcYlBDOG7dzmgAgBPuTahpvTMBipSH00";

let encryptedValue = "";

interface ConfLabel {
  name: string;
  weight: number;
  value?: number | undefined;
  target: string;
}

interface IConf {
  "chain-id"?: number;
  "private-key-encrypted"?: string;
  "safe-address"?: string;
  "base-multiplier"?: number;
  "time-labels"?: ConfLabel[];
  "priority-labels"?: ConfLabel[];
  "auto-pay-mode"?: boolean;
  "analytics-mode"?: boolean;
  "max-concurrent-bounties"?: number;
  "incentive-mode"?: boolean;
}

const defaultConf: IConf = {
  "chain-id": 1,
  "private-key-encrypted": "",
  "safe-address": "",
  "base-multiplier": 1000,
  "time-labels": [
    {
      name: "Time: <1 Hour",
      weight: 0.125,
      value: 3600,
      target: "Price: 12.5+ USD",
    },
    {
      name: "Time: <1 Day",
      weight: 1,
      value: 86400,
      target: "Price: 100+ USD",
    },
    {
      name: "Time: <1 Week",
      weight: 2,
      value: 604800,
      target: "Price: 200+ USD",
    },
    {
      name: "Time: <2 Weeks",
      weight: 3,
      value: 1209600,
      target: "Price: 300+ USD",
    },
    {
      name: "Time: <1 Month",
      weight: 4,
      value: 2592000,
      target: "Price: 400+ USD",
    },
  ],
  "priority-labels": [
    {
      name: "Priority: 0 (Normal)",
      weight: 1,
      target: "Price: 100+ USD",
    },
    {
      name: "Priority: 1 (Medium)",
      weight: 2,
      target: "Price: 200+ USD",
    },
    {
      name: "Priority: 2 (High)",
      weight: 3,
      target: "Price: 300+ USD",
    },
    {
      name: "Priority: 3 (Urgent)",
      weight: 4,
      target: "Price: 400+ USD",
    },
    {
      name: "Priority: 4 (Emergency)",
      weight: 5,
      target: "Price: 500+ USD",
    },
  ],
  "auto-pay-mode": true,
  "analytics-mode": false,
  "incentive-mode": false,
  "max-concurrent-bounties": 2,
};

export const parseYAML = async (data: any): Promise<any | undefined> => {
  try {
    const parsedData = await YAML.parse(data);
    if (parsedData !== null) {
      return parsedData;
    } else {
      return undefined;
    }
  } catch (error) {
    return undefined;
  }
};

export const parseJSON = async (data: any): Promise<any | undefined> => {
  try {
    const parsedData = await JSON.parse(data);
    return parsedData;
  } catch (error) {
    return undefined;
  }
};

export const YAMLStringify = (value: any) => YAML.stringify(value, { defaultKeyType: "PLAIN", defaultStringType: "QUOTE_DOUBLE", lineWidth: 0 });

export const getConf = async (): Promise<string | undefined> => {
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
  } catch (error: any) {
    return undefined;
  }
};

const getTextBox = (text: string) => {
  const strLen = text.split("\n").length * 22;
  const strPx = `${strLen > 140 ? strLen : 140}px`;
  return strPx;
};

const sodiumEncryptedSeal = async (publicKey: string, secret: string) => {
  outKey.value = "";
  encryptedValue = "";
  try {
    await _sodium.ready;
    const sodium = _sodium;

    const binkey = sodium.from_base64(publicKey, sodium.base64_variants.URLSAFE_NO_PADDING);
    const binsec = sodium.from_string(secret);
    const encBytes = sodium.crypto_box_seal(binsec, binkey);
    const output = sodium.to_base64(encBytes, sodium.base64_variants.URLSAFE_NO_PADDING);
    defaultConf[KEY_NAME] = output;
    defaultConf["chain-id"] = Number(chainIdSelect.value);
    defaultConf["safe-address"] = safeAddressInput.value;
    outKey.value = YAMLStringify(defaultConf);
    outKey.style.height = getTextBox(outKey.value);
    encryptedValue = output;
    singleToggle("success", `Success: Key Encryption is ok.`);
  } catch (error: any) {
    singleToggle("error", `Error: ${error.message}`);
  }
};

const setConfig = async () => {
  try {
    toggleLoader("start");
    const pluginKit = Octokit.plugin(createOrUpdateTextFile);
    const octokit = new pluginKit({ auth: githubPAT.value });
    const { data: userInfo } = await octokit.rest.users.getByUsername({
      username: orgName.value,
    });
    if (userInfo.type === "Organization") {
      let repository_id: number | null = null;
      try {
        const { data: repository_info } = await octokit.rest.repos.get({
          owner: orgName.value,
          repo: REPO_NAME,
        });
        repository_id = repository_info.id;
      } catch (error) {
        if (!(error instanceof Error)) {
          return console.error(error);
        }

        console.error(error.message);
        try {
          const { data: repo_res } = await octokit.rest.repos.createInOrg({
            org: orgName.value,
            name: REPO_NAME,
            auto_init: true,
            private: true,
            visibility: "private",
            has_downloads: true,
          });
          repository_id = repo_res.id;
        } catch (error) {
          if (!(error instanceof Error)) {
            return console.error(error);
          }
          console.error(error.message);
          singleToggle("error", `Error: Repo initialization failed, try again later.`);
          return;
        }
      }

      const { data: appInstallations } = await octokit.rest.orgs.listAppInstallations({
        org: orgName.value,
        per_page: 100,
      });
      const ins = appInstallations.installations.filter(installation => installation.app_id === APP_ID);

      if (ins.length > 0) {
        const installation_id = ins[0].id;
        const { data: installed_repos } = await octokit.rest.apps.listInstallationReposForAuthenticatedUser({
          installation_id: installation_id,
        });
        const irs = installed_repos.repositories.filter(installed_repo => installed_repo.id === repository_id);

        if (irs.length === 0) {
          await octokit.rest.apps.addRepoToInstallationForAuthenticatedUser({
            installation_id: installation_id,
            repository_id: repository_id,
          });
        }

        const conf = await getConf();

        const updatedConf = defaultConf;
        const parsedConf: IConf | undefined = await parseYAML(conf);
        updatedConf[KEY_NAME] = encryptedValue;
        updatedConf["chain-id"] = Number(chainIdSelect.value);
        updatedConf["safe-address"] = safeAddressInput.value;

        // combine configs (default + remote org wide)
        const combinedConf = Object.assign(updatedConf, parsedConf);

        const stringified = YAMLStringify(combinedConf);
        outKey.value = stringified;
        const { updated } = await octokit.createOrUpdateTextFile({
          owner: orgName.value,
          repo: REPO_NAME,
          path: KEY_PATH,
          content: stringified,
          message: `${crypto.randomUUID()}`,
        });

        if (updated) {
          singleToggle("success", `Success: private key is updated.`);
        } else {
          singleToggle("success", `Success: private key is upto date.`);
        }

        await nextStep();
      } else {
        singleToggle("warn", `Warn: Please install the app first.`);
      }
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
};

const setInputListeners = () => {
  const inputs = document.querySelectorAll("input") as NodeListOf<HTMLInputElement>;

  inputs.forEach(input => {
    input.addEventListener("input", e => {
      inputClasses.forEach(className => (e.target as HTMLInputElement).classList.remove(className));
      (((e.target as HTMLInputElement).parentNode as HTMLElement).querySelector(".status-log") as HTMLElement).innerHTML = "";
    });
  });
};

let currentStep = 1;
let signer: JsonRpcSigner | undefined = undefined;

const nextStep = async () => {
  const configChainId = Number(chainIdSelect.value);
  const configChainIdHex = `0x${configChainId.toString(16)}`;

  const tokenNameSpan = document.getElementById("allowance + span");
  if (tokenNameSpan) {
    if (configChainIdHex === NetworkIds.Mainnet) {
      tokenNameSpan.innerHTML = "DAI";
    } else if (configChainIdHex === NetworkIds.Gnosis) {
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
    singleToggle("error", `Error: Please connect to ${getNetworkName(configChainIdHex)}.`);
    if (await switchNetwork(provider, configChainId)) {
      singleToggle("success", ``);
    }
  }

  // watch for chain changes
  window.ethereum.on("chainChanged", async (currentChainId: string) => {
    if (configChainIdHex === currentChainId) {
      singleToggle("success", ``);
    } else {
      singleToggle("error", `Error: Please connect to ${getNetworkName(configChainIdHex)}.`);
      switchNetwork(provider, configChainId);
    }
  });
};

const switchNetwork = async (provider: ethers.providers.Web3Provider, chainId: string | number): Promise<boolean> => {
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
  } catch (error: any) {
    return false;
  }
};

const isHex = (str: string): boolean => {
  const regexp = /^[0-9a-fA-F]+$/;
  return regexp.test(str);
};

const step1Handler = async () => {
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
  if (!safeAddressInput.value.startsWith("0x")) {
    singleToggle("warn", `Warn: Safe Address must start with 0x.`, safeAddressInput);
    return;
  }
  if (!isHex(safeAddressInput.value.substring(2))) {
    singleToggle("warn", `Warn: Safe Address is not a valid hex string.`, safeAddressInput);
    return;
  }
  if (safeAddressInput.value.length !== 42) {
    singleToggle("warn", `Warn: Safe Address must be 20 bytes long.`, safeAddressInput);
    return;
  }

  await sodiumEncryptedSeal(X25519_KEY, `${KEY_PREFIX}${walletPrivateKey.value}`);
  setConfig();
};

const step2Handler = async () => {
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
    const configChainIdHex = `0x${configChainId.toString(16)}`;

    window.ethereum.on("chainChanged", async (currentChainId: string) => {
      if (configChainIdHex === currentChainId) {
        singleToggle("success", ``);
      } else {
        singleToggle("error", `Error: Please connect to ${chainIdSelect.value}.`);
        switchNetwork(provider, configChainId);
      }
    });

    if (walletChainId !== configChainId) {
      if (!(await switchNetwork(provider, configChainId))) {
        singleToggle("error", `Error: Switch to the correct chain.`);
        return;
      }
    }

    // load token contract
    let token = "";
    if (configChainIdHex === NetworkIds.Mainnet) {
      token = Tokens.DAI;
    } else if (configChainIdHex === NetworkIds.Gnosis) {
      token = Tokens.WXDAI;
    }
    const erc20 = new ethers.Contract(token, daiAbi, signer);
    const decimals = await erc20.decimals();
    const allowance = Number(allowanceInput.value);
    if (allowance <= 0) {
      singleToggle("error", `Error: Allowance should be greater than 0.`);
      return;
    }

    await erc20.approve(PERMIT2_ADDRESS, parseUnits(allowance.toString(), decimals));
    singleToggle("success", `Success`);
  } catch (error) {
    console.error(error);
    singleToggle("error", `Error: ${error.reason}`);
  }
};

const init = async () => {
  setInputListeners();

  setBtn.addEventListener("click", async () => {
    if (currentStep === 1) {
      await step1Handler();
    } else if (currentStep === 2) {
      await step2Handler();
    }
  });
};

init();
