import { BigNumber, ethers } from "ethers";
import { networkNames, getNetworkName } from "../constants";
import invalidateButton from "../invalidate-component";
import { app } from "../render-transaction/index";
import { setClaimMessage } from "../render-transaction/set-claim-message";
import { errorToast, claimButton, toaster, loadingClaimButton, resetClaimButton } from "../toaster";
import { checkPermitClaimable } from "./check-permit-claimable";
import { connectWallet } from "./connect-wallet";
import { fetchTreasury } from "./fetch-treasury";
import { invalidateNonce } from "./invalidate-nonce";
import { switchNetwork } from "./switch-network";
import { renderTreasuryStatus } from "./render-treasury-status";
import { withdraw } from "./withdraw";

export async function pay(retry = false): Promise<void> {
  let detailsVisible = false;

  const table = document.getElementsByTagName(`table`)[0];
  table.setAttribute(`data-details-visible`, detailsVisible.toString());

  const additionalDetails = document.getElementById(`additionalDetails`) as Element;
  additionalDetails.addEventListener("click", () => {
    detailsVisible = !detailsVisible;
    table.setAttribute(`data-details-visible`, detailsVisible.toString());
  });

  fetchTreasury().then(renderTreasuryStatus).catch(errorToast);

  const signer = await connectWallet(retry);
  const signerAddress = await signer?.getAddress();

  // check if permit is already claimed
  checkPermitClaimable()
    .then((claimable: boolean) => checkPermitClaimableHandler(claimable, table, signerAddress, signer))
    .catch(errorToast);

  const web3provider = new ethers.providers.Web3Provider(window.ethereum);
  if (!web3provider || !web3provider.provider.isMetaMask) {
    toaster.create("info", "Please connect to MetaMask.");
    loadingClaimButton(false);
    invalidateButton.disabled = true;
  }

  const currentNetworkId = await web3provider.provider.request!({ method: "eth_chainId" });

  // watch for network changes
  window.ethereum.on("chainChanged", handleIfOnCorrectNetwork);

  // if its not on ethereum mainnet, gnosis, or goerli, display error
  // notOnCorrectNetwork(currentNetworkId, web3provider);

  claimButton.element.addEventListener("click", curryClaimButtonHandler(signer));
}

function notOnCorrectNetwork(currentNetworkId: any, web3provider: ethers.providers.Web3Provider) {
  if (currentNetworkId !== app.claimNetworkId) {
    if (app.claimNetworkId == void 0) {
      console.error(`You must pass in an EVM network ID in the URL query parameters using the key 'network' e.g. '?network=1'`);
    }
    const networkName = getNetworkName(app.claimNetworkId);
    if (!networkName) {
      toaster.create("error", `This dApp currently does not support payouts for network ID ${app.claimNetworkId}`);
    }
    loadingClaimButton(false);
    invalidateButton.disabled = true;
    switchNetwork(web3provider);
  }
}

function handleIfOnCorrectNetwork(currentNetworkId: string) {
  if (app.claimNetworkId === currentNetworkId) {
    // enable the button once on the correct network
    resetClaimButton();
    invalidateButton.disabled = false;
  } else {
    loadingClaimButton(false);
    invalidateButton.disabled = true;
  }
}

function curryClaimButtonHandler(signer: ethers.providers.JsonRpcSigner | null) {
  return async function claimButtonHandler() {
    try {
      if (!signer?._isSigner) {
        signer = await connectWallet();
        if (!signer?._isSigner) {
          return;
        }
      }
      loadingClaimButton();

      const { balance, allowance, decimals } = await fetchTreasury();
      renderTreasuryStatus({ balance, allowance, decimals }).catch(errorToast);
      let errorMessage: string | undefined = undefined;
      const permitted = Number(app.txData.permit.permitted.amount);
      const solvent = balance >= permitted;
      const allowed = allowance >= permitted;
      const beneficiary = app.txData.transferDetails.to.toLowerCase();
      const user = (await signer.getAddress()).toLowerCase();

      if (beneficiary !== user) {
        toaster.create("warning", `This reward is not for you.`);
        resetClaimButton();
      } else if (!solvent) {
        toaster.create("error", `Not enough funds on funding wallet to collect this reward. Please let the funder know.`);
        resetClaimButton();
      } else if (!allowed) {
        toaster.create("error", `Not enough allowance on the funding wallet to collect this reward. Please let the funder know.`);
        resetClaimButton();
      } else {
        await withdraw(signer, app.txData, errorMessage);
      }
    } catch (error: unknown) {
      errorToast(error, "");
      resetClaimButton();
    }
  };
}

function checkPermitClaimableHandler(claimable: boolean, table: HTMLTableElement, signerAddress?: string, signer?: ethers.providers.JsonRpcSigner | null) {
  if (!claimable) {
    setClaimMessage({ type: "Notice", message: `This permit is not claimable` });
    table.setAttribute(`data-claim`, "none");
  } else {
    if (signerAddress?.toLowerCase() === app.txData.owner.toLowerCase()) {
      generateInvalidatePermitAdminControl(signer);
    }
  }
  return signer;
}

function generateInvalidatePermitAdminControl(signer?: ethers.providers.JsonRpcSigner | null) {
  const controls = document.getElementById("controls") as HTMLDivElement;
  controls.appendChild(invalidateButton);

  invalidateButton.addEventListener("click", async function invalidateButtonClickHandler() {
    if (!signer?._isSigner) {
      signer = await connectWallet();
      if (!signer?._isSigner) {
        return;
      }
    }
    try {
      await invalidateNonce(signer, BigNumber.from(app.txData.permit.nonce));
    } catch (error: any) {
      toaster.create("error", `${error.reason ?? error.message ?? "Unknown error"}`);
      return;
    }
    toaster.create("info", "Nonce invalidation transaction sent");
  });
}
