import { JsonRpcSigner } from "@ethersproject/providers";
import { ethers } from "ethers";
import { permit2Abi } from "../abis";
import { permit2Address } from "../constants";
import { TxType } from "../render-transaction/tx-type";
import { toaster, resetClaimButton, errorToast, loadingClaimButton } from "../toaster";

export async function withdraw(signer: JsonRpcSigner, txData: TxType, errorMessage?: string) {
  const permit2Contract = new ethers.Contract(permit2Address, permit2Abi, signer);
  await permit2Contract
    .permitTransferFrom(txData.permit, txData.transferDetails, txData.owner, txData.signature)
    .then((tx: any) => {
      // get success message
      toaster.create("info", `Transaction sent`);
      tx.wait().then((receipt: any) => {
        toaster.create("success", `Transaction pending: ${receipt?.transactionHash}`);
        loadingClaimButton(false); // disables the claim button
      });
    })
    .catch((error: any) => {
      console.log(error);
      errorToast(error, errorMessage);
      resetClaimButton();
    });
}
