import { JsonRpcSigner } from "@ethersproject/providers";
import { ethers } from "ethers";

const loader = document.querySelector(".loader-wrap") as HTMLElement;
const classes = ["error", "warn", "success"];
export const setBtn = document.getElementById("setBtn") as HTMLButtonElement;
export const orgName = document.getElementById("orgName") as HTMLInputElement;
export const walletPrivateKey = document.getElementById("walletPrivateKey") as HTMLInputElement;
export const safeAddressInput = document.getElementById("safeAddress") as HTMLInputElement;
export const allowanceInput = document.getElementById("allowance") as HTMLInputElement;
export const chainIdSelect = document.getElementById("chainId") as HTMLSelectElement;
export const inputClasses = ["input-warn", "input-error", "input-success"];
export const outKey = document.getElementById("outKey") as HTMLInputElement;
export const githubPAT = document.getElementById("githubPat") as HTMLInputElement;

const resetToggle = () => {
  (walletPrivateKey.parentNode?.querySelector(".status-log") as HTMLElement).innerHTML = "";
  (githubPAT.parentNode?.querySelector(".status-log") as HTMLElement).innerHTML = "";
  (orgName.parentNode?.querySelector(".status-log") as HTMLElement).innerHTML = "";
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
  const statusKey = document.getElementById("statusKey") as HTMLInputElement;
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

export const toggleLoader = (state: "start" | "end") => {
  if (state === "start") {
    setBtn.disabled = true;
    loader.style.display = "flex";
  } else {
    setBtn.disabled = false;
    loader.style.display = "none";
  }
};

export const singleToggle = (type: "error" | "warn" | "success", message: string, focusElem?: HTMLInputElement | HTMLTextAreaElement) => {
  statusToggle(type, message);

  if (focusElem) {
    focusToggle(focusElem, type, message);
  }

  toggleLoader("end");
};

export const connectWallet = async (): Promise<JsonRpcSigner | undefined> => {
  try {
    const provider = new ethers.providers.Web3Provider(window.ethereum, "any");
    await provider.send("eth_requestAccounts", []);
    const signer = provider.getSigner();
    return signer;
  } catch (error: any) {
    if (error?.message?.includes("missing provider")) {
      singleToggle("error", "Error: Please install MetaMask.");
    } else {
      singleToggle("error", "Error: Please connect your wallet.");
    }
    return undefined;
  }
};