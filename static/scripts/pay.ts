import { ethers } from "ethers";
import { JsonRpcSigner } from "@ethersproject/providers";
import { daiAbi, permit2Abi } from "./abis";
import { TxType, txData } from "./render-transaction";

const permit2Address = "0x000000000022D473030F116dDEE9F6B43aC78BA3";

const ErrorHandler = (error: any, extra: string | undefined = undefined) => {
  const output = document.querySelector(`footer>code`) as Element;
  delete error.stack;
  let ErrorData = JSON.stringify(error, null, 2);
  if (extra !== undefined) {
    ErrorData = extra + "\n\n" + ErrorData;
  }
  output.innerHTML = ErrorData;
};

const connectWallet = async (): Promise<JsonRpcSigner> => {
  try {
    const provider = new ethers.providers.Web3Provider((window).ethereum, "any");
    await provider.send("eth_requestAccounts", []);
    const signer = provider.getSigner();
    return signer;
  } catch (error: any) {
    if(error?.message?.includes("missing provider")) {
      console.error("Error: Please use a web3 enabled browser.");
    } else {
      console.error("Error: Please connect your wallet.");
    }
    return {} as JsonRpcSigner;
  }
};

const withdraw = async (signer: JsonRpcSigner, txData: TxType, predefined: string | undefined = undefined) => {
  const permit2Contract = new ethers.Contract(permit2Address, permit2Abi, signer);
  await permit2Contract
    .permitTransferFrom(txData.permit, txData.transferDetails, txData.owner, txData.signature)
    .catch((error: any) => ErrorHandler(error, predefined));
};

const fetchTreasury = async (): Promise<{ balance: number; allowance: number }> => {
  try {
    const provider = new ethers.providers.Web3Provider((window).ethereum)

    const tokenAddress = txData.permit.permitted.token;
    const tokenContract = new ethers.Contract(tokenAddress, daiAbi, provider);
    const balance = await tokenContract.balanceOf(txData.owner);
    const allowance = await tokenContract.allowance(txData.owner, permit2Address);
    return { balance, allowance };
  } catch (error: any) {
    if(error?.message?.includes("missing provider")) {
      alert("Error: Please use a web3 enabled browser.");
    } else {
      alert("Error: Please connect your wallet.");
    }
    return { balance: -1, allowance: -1 };
  }
};

const toggleStatus = async (balance: number, allowance: number) => {
  const trBalance = document.querySelector(".tr-balance") as Element;
  const trAllowance = document.querySelector(".tr-allowance") as Element;
  trBalance.textContent = balance > 0 ? `$${ethers.utils.formatUnits(balance, 18)}` : 'N/A';
  trAllowance.textContent = balance > 0 ? `$${ethers.utils.formatUnits(allowance, 18)}` : 'N/A';
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

      if (!signer._isSigner){
        return
      }

      const { balance, allowance } = await fetchTreasury();
      await toggleStatus(balance, allowance);
      let predefined: string | undefined = undefined;

      if (!(balance >= Number(txData.permit.permitted.amount) && allowance >= Number(txData.permit.permitted.amount))) {
        if (balance >= Number(txData.permit.permitted.amount)) {
          predefined = "Error: Not enough allowance to claim.";
        } else {
          predefined = "Error: Not enough funds on treasury to claim.";
        }
      }
      await withdraw(signer, txData, predefined);
    } catch (error: unknown) {
      console.error(error);
    }
  });

  const { balance, allowance } = await fetchTreasury();
  await toggleStatus(balance, allowance);

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
