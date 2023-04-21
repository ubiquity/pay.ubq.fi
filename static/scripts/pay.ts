import { ethers } from "ethers";
import { JsonRpcSigner } from "@ethersproject/providers";
import { daiAbi, permit2Abi } from "./abis";
import { TxType, txData } from "./render-transaction";

const permit2Address = "0x000000000022D473030F116dDEE9F6B43aC78BA3";

const notifications = document.querySelector(".notifications") as Element;
const claimButtonElem = document.getElementById("claimButton") as Element;
const buttonMark = document.querySelector('.hide-load');
const claimLoader = document.querySelector(".claim-loader") as Element;

// Object containing details for different types of toasts
const toastDetails = {
    timer: 5000,
    success: {
        icon: 'fa-circle-check',
    },
    error: {
        icon: 'fa-circle-xmark',
    },
    warning: {
        icon: 'fa-triangle-exclamation',
    },
    info: {
        icon: 'fa-circle-info',
    }
}

const removeToast = (toast) => {
    toast.classList.add("hide");
    if(toast.timeoutId) clearTimeout(toast.timeoutId); // Clearing the timeout for the toast
    setTimeout(() => toast.remove(), 500); // Removing the toast after 500ms
}

const createToast = (id: string, text: string) => {
    // Getting the icon and text for the toast based on the id passed
    const { icon } = toastDetails[id];
    const toast = document.createElement("li"); // Creating a new 'li' element for the toast
    toast.className = `toast ${id}`; // Setting the classes for the toast
    // Setting the inner HTML for the toast
    toast.innerHTML = `
      <div class="column">
          <i class="fa-solid ${icon}"></i>
          <span>${text}</span>
      </div>
      <i class="fa-solid fa-xmark" onclick="removeToast(this.parentElement)"></i>
    `;
    notifications.appendChild(toast); // Append the toast to the notification ul
    
    // Setting a timeout to remove the toast after the specified duration
    // @ts-ignore
    toast!.timeoutId = setTimeout(() => removeToast(toast), toastDetails.timer);
}

const disableClaimButton = () => {
  // @ts-ignore
  claimButtonElem!.disabled = true;
  
  // @ts-ignore
  claimLoader!.style!.display = 'block';
  // @ts-ignore
  buttonMark!.style!.display = 'none';
}

const enableClaimButton = () => {
  // @ts-ignore
  claimButtonElem!.disabled = false;
  
  // @ts-ignore
  claimLoader!.style!.display = 'none';
  // take it back to default
  // @ts-ignore
  buttonMark!.style!.display = '';
}

const ErrorHandler = (error: any, extra: string | undefined = undefined) => {
  delete error.stack;
  let ErrorData = JSON.stringify(error, null, 2);
  if (extra !== undefined) {
    createToast('error', extra);
    return;
  }
  // parse error data to get error message
  const parsedError = JSON.parse(ErrorData);
  const errorMessage = parsedError?.error?.message;
  createToast('error', `Error: ${errorMessage}`)
};

const connectWallet = async (): Promise<JsonRpcSigner> => {
  const provider = new ethers.providers.Web3Provider((window as any).ethereum, "any");
  await provider.send("eth_requestAccounts", []);
  const signer = provider.getSigner();
  return signer;
};

const withdraw = async (signer: JsonRpcSigner, txData: TxType, predefined: string | undefined = undefined) => {
  const permit2Contract = new ethers.Contract(permit2Address, permit2Abi, signer);
  await permit2Contract
    .permitTransferFrom(txData.permit, txData.transferDetails, txData.owner, txData.signature)
    .then((tx: any) => {
      // get success message
      createToast('success', `Transaction sent: ${tx?.hash}`);
      tx.wait().then((receipt: any) => {
        createToast('success', `Transaction confirmed: ${receipt?.transactionHash}`);
      });
      enableClaimButton()
    })
    .catch((error: any) => {
      ErrorHandler(error, predefined)
      enableClaimButton()
    });
};

const fetchTreasury = async (): Promise<{ balance: number; allowance: number }> => {
  const tokenAddress = txData.permit.permitted.token;
  const tokenContract = new ethers.Contract(tokenAddress, daiAbi, new ethers.providers.Web3Provider((window as any).ethereum));
  const balance = await tokenContract.balanceOf(txData.owner);
  const allowance = await tokenContract.allowance(txData.owner, permit2Address);
  return { balance, allowance };
};

const toggleStatus = async (balance: number, allowance: number) => {
  const trBalance = document.querySelector(".tr-balance") as Element;
  const trAllowance = document.querySelector(".tr-allowance") as Element;
  trBalance.textContent = `$${ethers.utils.formatUnits(balance, 18)}`;
  trAllowance.textContent = `$${ethers.utils.formatUnits(allowance, 18)}`;
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

  claimButtonElem.addEventListener("click", async () => {
    try {
      disableClaimButton()

      const signer = await connectWallet();
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
      enableClaimButton()
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
