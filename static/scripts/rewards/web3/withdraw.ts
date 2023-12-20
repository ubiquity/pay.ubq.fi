import { JsonRpcSigner } from "@ethersproject/providers";
import { ethers } from "ethers";
import { permit2Abi } from "../abis";
import { permit2Address } from "../constants";
import { Permit } from "../render-transaction/tx-type";
import { toaster, resetClaimButton, errorToast, loadingClaimButton, hideClaimButton } from "../toaster";
import { app } from "../render-transaction";
import { shortenAddress } from "../render-transaction/insert-table-data";
import { renderTransaction } from "../render-transaction/render-transaction";

export async function withdraw(signer: JsonRpcSigner, permit: Permit, errorMessage?: string) {
  const permit2Contract = new ethers.Contract(permit2Address, permit2Abi, signer);
  await permit2Contract
    .permitTransferFrom(permit.permit, permit.transferDetails, permit.owner, permit.signature)
    .then((tx: any) => {
      // get success message
      toaster.create("info", `Transaction sent`);
      tx.wait().then((receipt: any) => {
        toaster.create("success", `Claim Complete: ${receipt?.transactionHash}`);
        const requestedAmountElement = document.getElementById("transferDetails.requestedAmount") as Element;
        requestedAmountElement.innerHTML += " has been claimed!";
        app.nextTx();
        renderTransaction();
      });
    })
    .catch((error: any) => {
      console.log(error);
      errorToast(error, errorMessage);
      resetClaimButton();
    });
}
