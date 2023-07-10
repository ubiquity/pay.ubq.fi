import { JsonRpcSigner } from "@ethersproject/providers";
import { PERMIT2_ADDRESS } from "@uniswap/permit2-sdk";
import { BigNumber, ethers } from "ethers";
import { daiAbi, permit2Abi } from "./abis";
import { networkName, networkRpc } from "./constants";
import invalidateBtnInnerHTML from "./invalidate-component";
import { TxType, claimNetworkId, setClaimMessage, txData } from "./render-transaction";

const permit2Address = "0x000000000022D473030F116dDEE9F6B43aC78BA3";

const notifications = document.querySelector(".notifications") as HTMLElement;
const claimButtonElem = document.getElementById("claimButton") as HTMLButtonElement;
const buttonMark = document.querySelector(".claim-icon") as HTMLElement;
const claimLoader = document.querySelector(".claim-loader") as HTMLElement;
const controls = document.querySelector("#controls") as HTMLElement;

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
  const errorMessage = parsedError?.error?.message ?? parsedError?.reason;
  createToast("error", `Error: ${errorMessage}`);
};

const connectWallet = async (): Promise<JsonRpcSigner> => {
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

const switchNetwork = async (provider: ethers.providers.Web3Provider): Promise<boolean> => {
  try {
    await provider.send("wallet_switchEthereumChain", [{ chainId: claimNetworkId }]);
    return true;
  } catch (error: any) {
    return false;
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
      console.log(error);
      ErrorHandler(error, predefined);
      enableClaimButton();
    });
};

const fetchTreasury = async (): Promise<{ balance: number; allowance: number; decimals: number }> => {
  try {
    const provider = new ethers.providers.JsonRpcProvider(networkRpc[claimNetworkId]);
    const tokenAddress = txData.permit.permitted.token;
    const tokenContract = new ethers.Contract(tokenAddress, daiAbi, provider);
    const balance = await tokenContract.balanceOf(txData.owner);
    const allowance = await tokenContract.allowance(txData.owner, permit2Address);
    const decimals = await tokenContract.decimals();
    return { balance, allowance, decimals };
  } catch (error: any) {
    return { balance: -1, allowance: -1, decimals: -1 };
  }
};

const toggleStatus = async (balance: number, allowance: number, decimals: number) => {
  const trBalance = document.querySelector(".tr-balance") as Element;
  const trAllowance = document.querySelector(".tr-allowance") as Element;
  trBalance.textContent = balance > 0 ? `$${ethers.utils.formatUnits(balance, decimals)}` : "N/A";
  trAllowance.textContent = balance > 0 ? `$${ethers.utils.formatUnits(allowance, decimals)}` : "N/A";
};

const checkPermitClaimed = async () => {
  // get tx from window
  let tx = window.txData;

  // Set contract address and ABI
  const provider = new ethers.providers.JsonRpcProvider(networkRpc[claimNetworkId]);
  const permit2Contract = new ethers.Contract(permit2Address, permit2Abi, provider);

  const { wordPos, bitPos } = nonceBitmap(BigNumber.from(tx.permit.nonce));
  const bitmap = await permit2Contract.nonceBitmap(txData.owner, wordPos);
  const bit = BigNumber.from(1)
    .shl(bitPos - 1)
    .and(bitmap);
  return !bit.eq(0);
};

const invalidateNonce = async (signer: ethers.providers.JsonRpcSigner, nonce: BigNumber): Promise<void> => {
  const permit2Contract = new ethers.Contract(PERMIT2_ADDRESS, permit2Abi, signer);
  const { wordPos, bitPos } = nonceBitmap(nonce);
  await permit2Contract.invalidateUnorderedNonces(wordPos, bitPos);
};

// mimics https://github.com/Uniswap/permit2/blob/db96e06278b78123970183d28f502217bef156f4/src/SignatureTransfer.sol#L150
const nonceBitmap = (nonce: BigNumber): { wordPos: BigNumber; bitPos: number } => {
  // wordPos is the first 248 bits of the nonce
  const wordPos = BigNumber.from(nonce).shr(8);
  // bitPos is the last 8 bits of the nonce
  const bitPos = BigNumber.from(nonce).and(0xff).toNumber();
  return { wordPos, bitPos };
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

  fetchTreasury().then(({ balance, allowance, decimals }) => {
    toggleStatus(balance, allowance, decimals);
  });

  let signer = await connectWallet();
  const signerAddress = await signer.getAddress();

  // check if permit is already claimed
  checkPermitClaimed().then(claimed => {
    if (claimed) {
      setClaimMessage("Notice", `Permit already claimed`);
      table.setAttribute(`data-claim`, "none");
    } else {
      if (signerAddress.toLowerCase() === txData.owner.toLowerCase()) {
        // invalidateBtn.style.display = "block";

        controls.appendChild(invalidateBtnInnerHTML);
        console.log(invalidateBtnInnerHTML);
        invalidateBtnInnerHTML.addEventListener("click", async () => {
          console.trace();
          if (!signer._isSigner) {
            signer = await connectWallet();
            if (!signer._isSigner) {
              return;
            }
          }
          try {
            await invalidateNonce(signer, BigNumber.from(txData.permit.nonce));
          } catch (error: any) {
            createToast("error", `Error: ${error.reason ?? error.message ?? "Unknown error"}`);
            return;
          }
          createToast("success", "Nonce invalidated!");
        });
      }
    }
  });

  const provider = new ethers.providers.Web3Provider(window.ethereum);
  if (!provider || !provider.provider.isMetaMask) {
    createToast("error", "Please connect to MetaMask.");
    disableClaimButton(false);
    invalidateBtnInnerHTML.disabled = true;
  }

  const currentNetworkId = await provider!.provider!.request!({ method: "eth_chainId" });

  // watch for network changes
  window.ethereum.on("chainChanged", async (currentNetworkId: string) => {
    if (claimNetworkId === currentNetworkId) {
      // enable the button once on the correct network
      enableClaimButton();
      invalidateBtnInnerHTML.disabled = false;
    } else {
      disableClaimButton(false);
      invalidateBtnInnerHTML.disabled = true;
    }
  });

  // if its not on ethereum mainnet, gnosis, or goerli, display error
  if (currentNetworkId !== claimNetworkId) {
    createToast("error", `Please switch to ${networkName[claimNetworkId]}`);
    disableClaimButton(false);
    invalidateBtnInnerHTML.disabled = true;
    switchNetwork(provider);
  }

  claimButtonElem.addEventListener("click", async () => {
    try {
      if (!signer._isSigner) {
        signer = await connectWallet();
        if (!signer._isSigner) {
          return;
        }
      }
      disableClaimButton();

      const { balance, allowance, decimals } = await fetchTreasury();
      await toggleStatus(balance, allowance, decimals);
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

  // check system light mode
  // const systemPrefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;

  // const drawConfig = {
  //   cell_resolution: 24,
  //   point_resolution: 1,
  //   shade: 255,
  //   step: 0.01,
  //   refresh: 1000 / 60,
  //   target: document.getElementById("grid")!,
  // };

  // systemPrefersDark && window.draw(drawConfig);
};
