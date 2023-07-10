import { BigNumber, ethers } from "ethers";
import { networkNames, getNetworkName } from "../constants";
import invalidateBtnInnerHTML from "../invalidate-component";
import { app } from "../render-transaction/index";
import { setClaimMessage } from "../render-transaction/set-claim-message";
import { ErrorHandler, claimButton, controls, createToast, disableClaimButton, enableClaimButton } from "../toaster";
import { checkPermitClaimed } from "./check-permit-claimed";
import { connectWallet } from "./connect-wallet";
import { fetchTreasury } from "./fetch-treasury";
import { invalidateNonce } from "./invalidate-nonce";
import { switchNetwork } from "./switch-network";
import { renderTreasuryStatus } from "./render-treasury-status";
import { withdraw } from "./withdraw";

export async function pay(): Promise<void> {
  let detailsVisible = false;

  const table = document.getElementsByTagName(`table`)[0];
  table.setAttribute(`data-details-visible`, detailsVisible.toString());

  const additionalDetailsElem = document.getElementById(`additionalDetails`) as Element;
  additionalDetailsElem.addEventListener("click", () => {
    detailsVisible = !detailsVisible;
    table.setAttribute(`data-details-visible`, detailsVisible.toString());
  });

  fetchTreasury().then(renderTreasuryStatus).catch(ErrorHandler);

  let signer = await connectWallet();
  const signerAddress = await signer.getAddress();

  // check if permit is already claimed
  checkPermitClaimed().then(curryPermitClaimedHandler(signerAddress, table, signer)).catch(ErrorHandler);

  const web3provider = new ethers.providers.Web3Provider(window.ethereum);
  if (!web3provider || !web3provider.provider.isMetaMask) {
    createToast("error", "Please connect to MetaMask.");
    disableClaimButton(false);
    invalidateBtnInnerHTML.disabled = true;
  }

  const currentNetworkId = await web3provider.provider.request!({ method: "eth_chainId" });

  // watch for network changes
  window.ethereum.on("chainChanged", handleIfOnCorrectNetwork);

  // if its not on ethereum mainnet, gnosis, or goerli, display error
  notOnCorrectNetwork(currentNetworkId, web3provider);

  claimButton.addEventListener("click", curryClaimButtonHandler(signer));
}

function notOnCorrectNetwork(currentNetworkId: any, web3provider: ethers.providers.Web3Provider) {
  if (currentNetworkId !== app.claimNetworkId) {
    if (app.claimNetworkId == void 0) {
      console.error(`You must pass in an EVM network ID in the URL query parameters using the key 'network' e.g. '?network=1'`);
    }
    const networkName = getNetworkName(app.claimNetworkId);
    if (!networkName) {
      createToast("error", `This dApp currently does not support payouts for network ID ${app.claimNetworkId}`);
    } else {
      createToast("info", `Please switch to ${getNetworkName(app.claimNetworkId)}`);
    }
    disableClaimButton(false);
    invalidateBtnInnerHTML.disabled = true;
    switchNetwork(web3provider);
  }
}

function handleIfOnCorrectNetwork(currentNetworkId: string) {
  if (app.claimNetworkId === currentNetworkId) {
    // enable the button once on the correct network
    enableClaimButton();
    invalidateBtnInnerHTML.disabled = false;
  } else {
    disableClaimButton(false);
    invalidateBtnInnerHTML.disabled = true;
  }
}

function curryClaimButtonHandler(signer: ethers.providers.JsonRpcSigner) {
  return async function claimButtonHandler() {
    try {
      if (!signer._isSigner) {
        signer = await connectWallet();
        if (!signer._isSigner) {
          return;
        }
      }
      disableClaimButton();

      const { balance, allowance, decimals } = await fetchTreasury();

      renderTreasuryStatus({ balance, allowance, decimals }).catch(ErrorHandler);

      let errorMessage: string | undefined = undefined;

      const permitted = Number(app.txData.permit.permitted.amount);

      const _balance = Number(balance.toString()) / 1e18;
      const _permitted = permitted / 1e18;
      const _allowance = Number(allowance.toString()) / 1e18;

      const solvent = balance >= permitted;
      const allowed = allowance >= permitted;

      if (!solvent) {
        errorMessage = `Not enough balance on funding wallet to claim permitted amount.`;
      }

      if (!allowed) {
        errorMessage = `Not enough allowance to claim.`;
      }

      await withdraw(signer, app.txData, errorMessage);
    } catch (error: unknown) {
      ErrorHandler(error, "");
      enableClaimButton();
    }
  };
}

function curryPermitClaimedHandler(signerAddress: string, table: HTMLTableElement, signer?: ethers.providers.JsonRpcSigner) {
  return function checkPermitClaimedHandler(claimed: boolean) {
    if (claimed) {
      setClaimMessage({ type: "Notice", message: `Permit already claimed` });
      table.setAttribute(`data-claim`, "none");
    } else {
      if (signerAddress.toLowerCase() === app.txData.owner.toLowerCase()) {
        controls.appendChild(invalidateBtnInnerHTML);
        invalidateBtnInnerHTML.addEventListener("click", async () => {
          console.trace();
          if (!signer?._isSigner) {
            signer = await connectWallet();
            if (!signer._isSigner) {
              return;
            }
          }
          try {
            await invalidateNonce(signer, BigNumber.from(app.txData.permit.nonce));
          } catch (error: any) {
            createToast("error", `${error.reason ?? error.message ?? "Unknown error"}`);
            return;
          }
          createToast("success", "Nonce invalidated!");
        });
      }
    }
  };
}
