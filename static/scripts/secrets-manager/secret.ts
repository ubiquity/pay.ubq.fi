import _sodium from "libsodium-wrappers";
import { Octokit } from "@octokit/rest";
import { createOrUpdateTextFile } from "@octokit/plugin-create-or-update-text-file";
import YAML from "yaml";

const classes = ["error", "warn", "success"];
const inputClasses = ["input-warn", "input-error", "input-success"];
const outKey = document.querySelector("#outKey") as HTMLInputElement;
const githubPAT = document.querySelector("#githubPat") as HTMLInputElement;
const orgName = document.querySelector("#orgName") as HTMLInputElement;
const walletPrivateKey = document.querySelector("#walletPrivateKey") as HTMLInputElement;
const ecPublicKey = document.querySelector("#ecPublicKey") as HTMLInputElement;
const setBtn = document.querySelector("#setBtn") as HTMLButtonElement;
const jsonBtn = document.querySelector("#jsonBtn") as HTMLButtonElement;
const yamlBtn = document.querySelector("#yamlBtn") as HTMLButtonElement;
const advKey = document.querySelector("#advKey") as HTMLTextAreaElement;
const loader = document.querySelector(".loader-wrap") as HTMLElement;

const APP_ID = 236521;
const REPO_NAME = "ubiquibot-config";
const KEY_PATH = ".github/ubiquibot-config.yml";
const KEY_NAME = "private-key-encrypted";
const KEY_PREFIX = "HSK_";
const X25519_KEY = "5ghIlfGjz_ChcYlBDOG7dzmgAgBPuTahpvTMBipSH00";

let encryptedValue = "";
let parseMode: "JSON" | "YAML" = "JSON";
let parsedAdv: any | undefined = {};

interface ConfLabel {
  name: string;
  weight: number;
  value?: number | undefined;
  target: string;
}

interface IConf {
  "chain-id"?: number;
  "private-key-encrypted"?: string;
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

const adVerify = async (adVal: string) => {
  advKey.style.height = getTextBox(adVal);
  if (parseMode === "JSON") {
    const parsedData = await parseJSON(adVal);
    parsedAdv = parsedData;
    if (parsedData !== undefined) {
      singleToggle("success", `Valid: the JSON config is ok.`, advKey);
    } else {
      singleToggle("error", `Invalid: the JSON config is incorrect.`, advKey);
    }
  } else {
    const parsedData = await parseYAML(adVal);
    parsedAdv = parsedData;
    if (parsedData !== undefined) {
      singleToggle("success", `Valid: the YAML config is ok.`, advKey);
    } else {
      singleToggle("error", `Invalid: the YAML config is incorrect.`, advKey);
    }
  }
};

const getTextBox = (text: string) => {
  const strLen = text.split("\n").length * 22;
  const strPx = `${strLen > 140 ? strLen : 140}px`;
  return strPx;
};

const toggleParseMode = (type: "JSON" | "YAML") => {
  parseMode = type;
  if (type === "JSON") {
    jsonBtn.disabled = true;
    yamlBtn.disabled = false;
  } else {
    yamlBtn.disabled = true;
    jsonBtn.disabled = false;
  }
  adVerify(advKey.value);
};

const resetToggle = () => {
  (walletPrivateKey.parentNode?.querySelector(".status-log") as HTMLElement).innerHTML = "";
  (githubPAT.parentNode?.querySelector(".status-log") as HTMLElement).innerHTML = "";
  (orgName.parentNode?.querySelector(".status-log") as HTMLElement).innerHTML = "";
  (ecPublicKey.parentNode?.querySelector(".status-log") as HTMLElement).innerHTML = "";
};

const classListToggle = (targetElem: HTMLElement, target: "error" | "warn" | "success", inputElem?: HTMLInputElement | HTMLTextAreaElement) => {
  classes.forEach(className => targetElem.classList.remove(className));
  targetElem.classList.add(target);

  if (inputElem) {
    inputClasses.forEach(className => inputElem.classList.remove(className));
    inputElem.classList.add(`input-${target}`);
  }
};

const statusToggle = (type: "error" | "warn" | "success", message: string) => {
  resetToggle();
  const statusKey = document.querySelector("#statusKey") as HTMLInputElement;
  classListToggle(statusKey, type);
  statusKey.value = message;
};

const focusToggle = (targetElem: HTMLInputElement | HTMLTextAreaElement, type: "error" | "warn" | "success", message: string) => {
  resetToggle();
  const infoElem = targetElem.parentNode?.querySelector(".status-log") as HTMLElement;
  infoElem.innerHTML = message;
  classListToggle(infoElem, type, targetElem);
  targetElem.focus();
};

const toggleLoader = (state: "start" | "end") => {
  if (state === "start") {
    setBtn.disabled = true;
    loader.style.display = "flex";
  } else {
    setBtn.disabled = false;
    loader.style.display = "none";
  }
};

const singleToggle = (type: "error" | "warn" | "success", message: string, focusElem?: HTMLInputElement | HTMLTextAreaElement) => {
  statusToggle(type, message);

  if (focusElem) {
    focusToggle(focusElem, type, message);
  }

  toggleLoader("end");
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
    outKey.value = YAMLStringify(defaultConf);
    outKey.style.height = getTextBox(outKey.value);
    encryptedValue = output;
    singleToggle("success", `Success: Key Encryption is ok.`);
  } catch (error: any) {
    singleToggle("error", `Error: ${error.message}`, ecPublicKey);
  }
};

const setHandler = async () => {
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
        const advParsed: IConf | undefined = parsedAdv;
        updatedConf[KEY_NAME] = encryptedValue;

        // combine configs (default + remote org wide + local from the "advanced" text field)
        const combinedConf = Object.assign(updatedConf, parsedConf, advParsed);

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

const init = () => {
  ecPublicKey.value = X25519_KEY;
  setInputListeners();

  setBtn.addEventListener("click", async () => {
    if (walletPrivateKey.value !== "") {
      await sodiumEncryptedSeal(X25519_KEY, `${KEY_PREFIX}${walletPrivateKey.value}`);
      if (encryptedValue !== "" && orgName.value !== "" && githubPAT.value !== "") {
        setHandler();
      } else if (encryptedValue === "") {
        singleToggle("warn", `Warn: Please encrypt first.`);
      } else if (orgName.value === "" && githubPAT.value === "") {
        singleToggle("warn", `Warn: Org Name and GitHub PAT is not set.`);
      } else if (orgName.value === "") {
        singleToggle("warn", `Warn: Org Name is not set.`, orgName);
      } else {
        singleToggle("warn", `Warn: GitHub PAT is not set.`, githubPAT);
      }
    } else {
      singleToggle("warn", `Warn: Private_Key is not set.`, walletPrivateKey);
    }
  });

  jsonBtn.addEventListener("click", () => {
    toggleParseMode("JSON");
  });

  yamlBtn.addEventListener("click", () => {
    toggleParseMode("YAML");
  });

  advKey.addEventListener("input", async e => {
    adVerify((e.target as HTMLTextAreaElement).value);
  });
};

init();
