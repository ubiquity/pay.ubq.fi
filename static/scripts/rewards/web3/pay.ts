import { BigNumber, BigNumberish, ethers } from "ethers";
import { networkNames, getNetworkName } from "../constants";
import invalidateButton from "../invalidate-component";
import { app } from "../render-transaction/index";
import { setClaimMessage } from "../render-transaction/set-claim-message";
import { errorToast, claimButton, toaster, loadingClaimButton, resetClaimButton } from "../toaster";
import { checkPermitClaimable } from "./check-permit-claimable";
import { connectWallet } from "./wallet";
import { invalidateNonce } from "./nonce";
import { renderTreasuryStatus, fetchTreasury } from "./permit-treasury";
import { withdraw } from "./withdraw";
import { Permit } from "../render-transaction/tx-type";
import { renderTransaction } from "../render-transaction/render-transaction";

export async function pay(permit: Permit): Promise<void> {
  const table = document.getElementsByTagName(`table`)[0];
  fetchTreasury(permit).then(renderTreasuryStatus).catch(errorToast);

  const signer = await connectWallet();
  const signerAddress = await signer?.getAddress();

  // check if permit is already claimed
  checkPermitClaimable(permit)
    .then((claimable: boolean) => checkPermitClaimableHandler(claimable, table, permit.owner, permit.permit.nonce, signerAddress, signer))
    .catch(errorToast);

  claimButton.element.addEventListener("click", curryClaimButtonHandler(permit, signer));
}

function curryClaimButtonHandler(permit: Permit, signer: ethers.providers.JsonRpcSigner | null) {
  return async function claimButtonHandler() {
    try {
      if (!signer?._isSigner) {
        signer = await connectWallet();
        if (!signer?._isSigner) {
          return;
        }
      }
      loadingClaimButton();
      app.nextTx();
      renderTransaction();
      return;

      const { balance, allowance, decimals } = await fetchTreasury(permit);
      renderTreasuryStatus({ balance, allowance, decimals }).catch(errorToast);
      let errorMessage: string | undefined = undefined;
      const permitted = BigNumber.from(permit.permit.permitted.amount);
      const solvent = balance.gte(permitted);
      const allowed = allowance.gte(permitted);
      const beneficiary = permit.transferDetails.to.toLowerCase();
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
        await withdraw(signer, permit, errorMessage);
      }
    } catch (error: unknown) {
      errorToast(error, "");
      resetClaimButton();
    }
  };
}

function checkPermitClaimableHandler(
  claimable: boolean,
  table: HTMLTableElement,
  ownerAddress: string,
  nonce: BigNumberish,
  signerAddress?: string,
  signer?: ethers.providers.JsonRpcSigner | null,
) {
  if (!claimable) {
    setClaimMessage({ type: "Notice", message: `This permit is not claimable` });
    table.setAttribute(`data-claim`, "none");
  } else {
    if (signerAddress?.toLowerCase() === ownerAddress.toLowerCase()) {
      generateInvalidatePermitAdminControl(nonce, signer);
    }
  }
  return signer;
}

function generateInvalidatePermitAdminControl(nonce: BigNumberish, signer?: ethers.providers.JsonRpcSigner | null) {
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
      await invalidateNonce(signer, nonce);
    } catch (error: any) {
      toaster.create("error", `${error.reason ?? error.message ?? "Unknown error"}`);
      return;
    }
    toaster.create("info", "Nonce invalidation transaction sent");
  });
}
