import _sodium from "libsodium-wrappers";
import { Octokit } from "@octokit/rest";
import { createOrUpdateTextFile } from "@octokit/plugin-create-or-update-text-file";

const classes = ["error", "warn", "success"];
const inputClasses = ["input-warn", "input-error"];
const outKey = document.querySelector("#outKey") as HTMLInputElement;
const githubPAT = document.querySelector("#githubPat") as HTMLInputElement;
const orgName = document.querySelector("#orgName") as HTMLInputElement;
const walletPrivateKey = document.querySelector("#walletPrivateKey") as HTMLInputElement;
const ecPublicKey = document.querySelector("#ecPublicKey") as HTMLInputElement;
const encryptBtn = document.querySelector("#encryptBtn") as HTMLButtonElement;
const setBtn = document.querySelector("#setBtn") as HTMLButtonElement;
const loader = document.querySelector(".loader-wrap") as HTMLElement;

const APP_ID = 236521;
const REPO_NAME = "ubiquibot-config";
const KEY_PATH = ".github/ubiquibot-config.yml";
const KEY_NAME = "PSK";
const KEY_PREFIX = "HSK_";

let encryptedValue = "";

const resetToggle = () => {
  (walletPrivateKey.parentNode?.querySelector(".status-log") as HTMLElement).innerHTML = "";
  (githubPAT.parentNode?.querySelector(".status-log") as HTMLElement).innerHTML = "";
  (orgName.parentNode?.querySelector(".status-log") as HTMLElement).innerHTML = "";
  (ecPublicKey.parentNode?.querySelector(".status-log") as HTMLElement).innerHTML = "";
};

const classListToggle = (targetElem: HTMLElement, target: "error" | "warn" | "success", inputElem?: HTMLInputElement) => {
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

const focusToggle = (targetElem: HTMLInputElement, type: "error" | "warn" | "success", message: string) => {
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

const singleToggle = (type: "error" | "warn" | "success", message: string, focusElem?: HTMLInputElement) => {
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
    outKey.value = `\n${KEY_NAME}: "${output}"\n`;
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

        const { updated } = await octokit.createOrUpdateTextFile({
          owner: orgName.value,
          repo: REPO_NAME,
          path: KEY_PATH,
          content: `${KEY_NAME}: "${encryptedValue}"`,
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
  setInputListeners();

  encryptBtn.addEventListener("click", () => {
    if (walletPrivateKey.value !== "") {
      sodiumEncryptedSeal(ecPublicKey.value, `${KEY_PREFIX}${walletPrivateKey.value}`);
    } else {
      singleToggle("warn", `Warn: Private_Key is not set.`, walletPrivateKey);
    }
  });

  setBtn.addEventListener("click", () => {
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
  });
};

init();
