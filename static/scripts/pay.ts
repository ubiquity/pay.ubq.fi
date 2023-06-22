import { ethers } from "ethers";
import { JsonRpcSigner } from "@ethersproject/providers";
import { daiAbi, permit2Abi } from "./abis";
import { TxType, txData, setClaimMessage } from "./render-transaction";

const permit2Address = "0x000000000022D473030F116dDEE9F6B43aC78BA3";
const daiAddress = "0x6B175474E89094C44Da98b954EedeAC495271d0F";

const supportedChains = [
  "0x1", // mainnet
  "0x5", // goerli
  "0x64", // gnosis
];

const notifications = document.querySelector(".notifications") as HTMLElement;
const claimButtonElem = document.getElementById("claimButton") as HTMLButtonElement;
const buttonMark = document.querySelector(".claim-icon") as HTMLElement;
const claimLoader = document.querySelector(".claim-loader") as HTMLElement;

// Object containing details for different types of toasts
const toastDetails = {
  timer: 5000,
  success: {
    icon: "fa-circle-check",
  },
  error: {
    icon: "fa-circle-xmark",
  },
  warning: {
    icon: "fa-triangle-exclamation",
  },
  info: {
    icon: "fa-circle-info",
  },
};

const removeToast = toast => {
  toast.classList.add("hide");
  if (toast.timeoutId) {
    clearTimeout(toast.timeoutId); // Clearing the timeout for the toast
  }
  setTimeout(() => toast.remove(), 500); // Removing the toast after 500ms
};

// mimics https://github.com/Uniswap/permit2/blob/db96e06278b78123970183d28f502217bef156f4/src/SignatureTransfer.sol#L150
const bitmapPositions = (nonce: string) => {
  const dividend = BigInt(nonce);
  const divisor = BigInt("256");
  const quotient = dividend / divisor;
  return quotient.toString();
};

const checkPermitClaimed = async (signer: JsonRpcSigner) => {
  // get tx from window
  let tx = (window as any).txData as typeof txData;

  // Set contract address and ABI
  const permit2Contract = new ethers.Contract(permit2Address, permit2Abi, signer);

  const claimed = await permit2Contract.nonceBitmap(txData?.owner, bitmapPositions(tx?.permit?.nonce));

  return claimed?.toString() !== "0"; // 0 is not claimed, any digit greater than 0 indicates claimed
};

const createToast = (id: string, text: string) => {
  // Getting the icon and text for the toast based on the id passed
  const { icon } = toastDetails[id];
  const toast = document.createElement("li") as any; // Creating a new 'li' element for the toast
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
  toast!.timeoutId = setTimeout(() => removeToast(toast), toastDetails.timer);
};

const disableClaimButton = (triggerLoader = true) => {
  claimButtonElem!.disabled = true;

  // Adding this because not all disabling should trigger loading spinner
  if (triggerLoader) {
    claimLoader?.classList.add("show-cl"), claimLoader?.classList.remove("hide-cl");

    buttonMark?.classList.add("hide-cl"), buttonMark?.classList.remove("show-cl");
  }
};

const enableClaimButton = () => {
  claimButtonElem!.disabled = false;

  claimLoader?.classList.add("hide-cl"), claimLoader?.classList.remove("show-cl");

  buttonMark?.classList.add("show-cl"), buttonMark?.classList.remove("hide-cl");
};

const ErrorHandler = (error: any, extra: string | undefined = undefined) => {
  delete error.stack;
  let ErrorData = JSON.stringify(error, null, 2);
  if (extra !== undefined) {
    createToast("error", extra);
    return;
  }
  // parse error data to get error message
  const parsedError = JSON.parse(ErrorData);
  const errorMessage = parsedError?.error?.message;
  createToast("error", `Error: ${errorMessage}`);
};

export const connectWallet = async (): Promise<JsonRpcSigner> => {
  try {
    const provider = new ethers.providers.Web3Provider(window.ethereum, "any");
    await provider.send("eth_requestAccounts", []);
    const signer = provider.getSigner();
    return signer;
  } catch (error: any) {
    if (error?.message?.includes("missing provider")) {
      createToast("error", "Error: Please use a web3 enabled browser.");
    } else {
      createToast("error", "Error: Please connect your wallet.");
    }
    return {} as JsonRpcSigner;
  }
};

const withdraw = async (signer: JsonRpcSigner, txData: TxType, predefined: string | undefined = undefined) => {
  const permit2Contract = new ethers.Contract(permit2Address, permit2Abi, signer);
  await permit2Contract
    .permitTransferFrom(txData.permit, txData.transferDetails, txData.owner, txData.signature)
    .then((tx: any) => {
      // get success message
      createToast("success", `Transaction sent: ${tx?.hash}`);
      tx.wait().then((receipt: any) => {
        createToast("success", `Transaction confirmed: ${receipt?.transactionHash}`);
      });
      enableClaimButton();
    })
    .catch((error: any) => {
      ErrorHandler(error, predefined);
      enableClaimButton();
    });
};

const fetchTreasury = async (): Promise<{ balance: number; allowance: number }> => {
  try {
    const provider = new ethers.providers.Web3Provider((window as any).ethereum);
    if (!provider || !provider.provider.isMetaMask) {
      createToast("error", "Please connect to MetaMask.");
      disableClaimButton(false);
      return { balance: -1, allowance: -1 };
    }

    const chainId = await provider!.provider!.request!({ method: "eth_chainId" });

    // watch for chain changes
    window.ethereum.on("chainChanged", async (chainId: string) => {
      if (supportedChains.includes(chainId)) {
        // enable the button once on the correct network
        enableClaimButton();
      }
    });

    // if its not on ethereum mainnet, gnosis, or goerli, display error
    if (!supportedChains.includes(chainId)) {
      createToast("error", `Please switch to ${txData.permit.permitted.token === daiAddress ? "Ethereum Mainnet" : "Gnosis Chain"}`);
      disableClaimButton(false);
      return { balance: -1, allowance: -1 };
    }

    const tokenAddress = txData.permit.permitted.token;
    const tokenContract = new ethers.Contract(tokenAddress, daiAbi, provider);
    const balance = await tokenContract.balanceOf(txData.owner);
    const allowance = await tokenContract.allowance(txData.owner, permit2Address);
    return { balance, allowance };
  } catch (error: any) {
    return { balance: -1, allowance: -1 };
  }
};

const toggleStatus = async (balance: number, allowance: number, signer: JsonRpcSigner) => {
  let decimals = 18;
  if (signer._isSigner) {
    const tokenContract = new ethers.Contract(txData.permit.permitted.token, daiAbi, signer);
    decimals = await tokenContract.decimals();
  }
  const trBalance = document.querySelector(".tr-balance") as Element;
  const trAllowance = document.querySelector(".tr-allowance") as Element;
  trBalance.textContent = balance > 0 ? `$${ethers.utils.formatUnits(balance, decimals)}` : "N/A";
  trAllowance.textContent = balance > 0 ? `$${ethers.utils.formatUnits(allowance, decimals)}` : "N/A";
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

  const signer = await connectWallet();

  // check if permit is already claimed
  if (signer._isSigner) {
    let claimed = await checkPermitClaimed(signer);

    if (claimed) {
      setClaimMessage("Notice", `Permit already claimed`);
      table.setAttribute(`data-claim`, "none");
    }
  }

  claimButtonElem.addEventListener("click", async () => {
    try {
      if (!signer._isSigner) {
        return;
      }
      disableClaimButton();

      const { balance, allowance } = await fetchTreasury();
      await toggleStatus(balance, allowance, signer);
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
      ErrorHandler(error, "");
      enableClaimButton();
    }
  });

  const { balance, allowance } = await fetchTreasury();
  await toggleStatus(balance, allowance, signer);

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
