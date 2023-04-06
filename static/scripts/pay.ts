import { ethers } from "ethers";
import { JsonRpcSigner } from "@ethersproject/providers";
import { daiAbi, permit2Abi } from "./abis";
import { TxType, txData } from "./render-transaction";

const ErrorHandler = (error: any) => {
  const output = document.querySelector(`footer>code`) as Element;
  delete error.stack;
  output.innerHTML = JSON.stringify(error, null, 2);
};

const connectWallet = async (): Promise<JsonRpcSigner> => {
  const provider = new ethers.providers.Web3Provider((window as any).ethereum, "any");
  await provider.send("eth_requestAccounts", []);
  const signer = provider.getSigner();
  return signer;
};

const withdraw = async (signer: JsonRpcSigner, txData: TxType) => {
  const permit2Address = "0x000000000022D473030F116dDEE9F6B43aC78BA3";
  const permit2Contract = new ethers.Contract(permit2Address, permit2Abi, signer);
  await permit2Contract.permitTransferFrom(txData.permit, txData.transferDetails, txData.owner, txData.signature).catch((error: any) => ErrorHandler(error));
};

const fetchTreasury = async (): Promise<number> => {
  const tokenAddress = txData.permit.permitted.token;
  const tokenContract = new ethers.Contract(tokenAddress, daiAbi, new ethers.providers.Web3Provider((window as any).ethereum));
  const balance = await tokenContract.balanceOf(txData.owner);
  return balance;
};

const toggleStatus = async (balance: number) => {
  const treasuryValue = document.querySelector(".treasury-value") as Element;
  treasuryValue.innerHTML =
    balance >= Number(txData.permit.permitted.amount)
      ? `<span id="value-green">$${ethers.utils.formatUnits(balance, 18)}</span`
      : `<span id="value-red">$${ethers.utils.formatUnits(balance, 18)}</span`;
};

export const pay = async (): Promise<void> => {
  let detailsVisible = false;

  const table = document.getElementsByTagName(`table`)[0];
  table.setAttribute(`data-details-visible`, detailsVisible.toString());

  const additionalDetailsElem = document.getElementById(`additionalDetails`) as Element;
  additionalDetailsElem.addEventListener("click", () => {
    detailsVisible = !detailsVisible;
    table.setAttribute(`data-details-visible`, detailsVisible.toString());
  });

  const claimButtonElem = document.getElementById("claimButton") as Element;
  claimButtonElem.addEventListener("click", async () => {
    try {
      const signer = await connectWallet();
      const balance = await fetchTreasury();
      await toggleStatus(balance);
      if (balance >= Number(txData.permit.permitted.amount)) {
        await withdraw(signer, txData);
      } else {
        ErrorHandler("Error: Not enough funds on treasury to claim");
      }
    } catch (error: unknown) {
      console.error(error);
    }
  });

  const balance = await fetchTreasury();
  await toggleStatus(balance);

  // display commit hash
  const commit = await fetch("commit.txt");
  if (commit.ok) {
    const commitHash = await commit.text();
    const buildElement = document.querySelector(`#build a`) as any;
    buildElement.innerHTML = `${commitHash}`;
    buildElement.href = `https://github.com/ubiquity/generate-permit/commit/${commitHash}`;
  }
  // check system light mode
  const systemPrefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;

  const drawConfig = {
    cell_resolution: 24,
    point_resolution: 1,
    shade: 255,
    step: 0.01,
    refresh: 1000 / 60,
    target: document.getElementById("grid"),
  };

  systemPrefersDark && (window as any).draw(drawConfig);
};
