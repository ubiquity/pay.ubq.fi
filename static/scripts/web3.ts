import { JsonRpcSigner } from "@ethersproject/providers";
import { PERMIT2_ADDRESS } from "@uniswap/permit2-sdk";
import { BigNumber, ethers } from "ethers";
import { daiAbi, permit2Abi } from "./abis";
import { networkName, networkRpc, permit2Address } from "./constants";
import invalidateBtnInnerHTML from "./invalidate-component";
import { app } from "./render-transaction/index";
import { TxType } from "./render-transaction/tx-type";
import { setClaimMessage } from "./render-transaction/set-claim-message";
import { createToast, enableClaimButton, ErrorHandler, controls, claimButton, disableClaimButton } from "./toaster";

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
    await provider.send("wallet_switchEthereumChain", [{ chainId: app.claimNetworkId }]);
    return true;
  } catch (error: any) {
    return false;
  }
};
const withdraw = async (signer: JsonRpcSigner, txData: TxType, errorMessage?: string) => {
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
      ErrorHandler(error, errorMessage);
      enableClaimButton();
    });
};
const fetchTreasury = async (): Promise<{ balance: number; allowance: number; decimals: number }> => {
  try {
    const provider = new ethers.providers.JsonRpcProvider(networkRpc[app.claimNetworkId]);
    const tokenAddress = app.txData.permit.permitted.token;
    const tokenContract = new ethers.Contract(tokenAddress, daiAbi, provider);
    const balance = await tokenContract.balanceOf(app.txData.owner);
    const allowance = await tokenContract.allowance(app.txData.owner, permit2Address);
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
  let tx = app.txData;

  // Set contract address and ABI
  const provider = new ethers.providers.JsonRpcProvider(networkRpc[app.claimNetworkId]);
  const permit2Contract = new ethers.Contract(permit2Address, permit2Abi, provider);

  const { wordPos, bitPos } = nonceBitmap(BigNumber.from(tx.permit.nonce));
  const bitmap = await permit2Contract.nonceBitmap(app.txData.owner, wordPos);
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
  const bitPos = BigNumber.from(nonce).and(255).toNumber();
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
      setClaimMessage({ type: "Notice", message: `Permit already claimed` });
      table.setAttribute(`data-claim`, "none");
    } else {
      if (signerAddress.toLowerCase() === app.txData.owner.toLowerCase()) {
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
            await invalidateNonce(signer, BigNumber.from(app.txData.permit.nonce));
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
    if (app.claimNetworkId === currentNetworkId) {
      // enable the button once on the correct network
      enableClaimButton();
      invalidateBtnInnerHTML.disabled = false;
    } else {
      disableClaimButton(false);
      invalidateBtnInnerHTML.disabled = true;
    }
  });

  // if its not on ethereum mainnet, gnosis, or goerli, display error
  if (currentNetworkId !== app.claimNetworkId) {
    createToast("error", `Please switch to ${networkName[app.claimNetworkId]}`);
    disableClaimButton(false);
    invalidateBtnInnerHTML.disabled = true;
    switchNetwork(provider);
  }

  claimButton.addEventListener("click", async () => {
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
      let errorMessage: string | undefined = undefined;

      if (!(balance >= Number(app.txData.permit.permitted.amount) && allowance >= Number(app.txData.permit.permitted.amount))) {
        if (balance >= Number(app.txData.permit.permitted.amount)) {
          errorMessage = "Error: Not enough allowance to claim.";
        } else {
          errorMessage = "Error: Not enough funds on treasury to claim.";
        }
      }
      await withdraw(signer, app.txData, errorMessage);
    } catch (error: unknown) {
      ErrorHandler(error, "");
      enableClaimButton();
    }
  });
};
