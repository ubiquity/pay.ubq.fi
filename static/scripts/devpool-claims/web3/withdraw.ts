import { JsonRpcSigner } from "@ethersproject/providers";
import { ethers } from "ethers";
import { permit2Abi } from "../abis";
import { permit2Address } from "../constants";
import { TxType } from "../render-transaction/tx-type";
import { createToast, resetClaimButton, ErrorHandler } from "../toaster";

export async function withdraw(signer: JsonRpcSigner, txData: TxType, errorMessage?: string) {
  const permit2Contract = new ethers.Contract(permit2Address, permit2Abi, signer);
  await permit2Contract
    .permitTransferFrom(txData.permit, txData.transferDetails, txData.owner, txData.signature)
    .then((tx: any) => {
      // get success message
      createToast("success", `Transaction sent: ${tx?.hash}`);
      tx.wait().then((receipt: any) => {
        createToast("success", `Transaction confirmed: ${receipt?.transactionHash}`);
      });
      resetClaimButton();
    })
    .catch((error: any) => {
      console.log(error);
      ErrorHandler(error, errorMessage);
      resetClaimButton();
    });
}
