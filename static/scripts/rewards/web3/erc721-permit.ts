import { ethers } from "ethers";
import { Erc721Permit } from "../render-transaction/tx-type";
import { claimButton, errorToast, loadingClaimButton, resetClaimButton, toaster } from "../toaster";
import { connectWallet } from "./wallet";
import { nftRewardAbi } from "../abis/nftRewardAbi";
import { TransactionResponse } from "@ethersproject/providers";
import { networkRpcs } from "../constants";
import { renderTransaction } from "../render-transaction/render-transaction";

export function claimErc721PermitHandler(permit: Erc721Permit) {
  return async function claimButtonHandler() {
    const signer = await connectWallet();
    if (!signer) {
      return;
    }

    if ((await signer.getAddress()).toLowerCase() !== permit.request.beneficiary) {
      toaster.create("warning", `This NFT is not for you.`);
      resetClaimButton();
      return;
    }

    if (permit.request.deadline.lt(Math.floor(Date.now() / 1000))) {
      toaster.create("error", `This NFT has expired.`);
      resetClaimButton();
      return;
    }

    const reedemed = await isNonceRedeemed(permit);
    if (reedemed) {
      toaster.create("error", `This NFT has already been redeemed.`);
      resetClaimButton();
      return;
    }

    loadingClaimButton();
    try {
      const nftContract = new ethers.Contract(permit.nftAddress, nftRewardAbi, signer);

      const tx: TransactionResponse = await nftContract.safeMint(permit.request, permit.signature);
      toaster.create("info", `Transaction sent. Waiting for confirmation...`);
      const receipt = await tx.wait();
      toaster.create("success", `Claim Complete: ${receipt.transactionHash}`);

      claimButton.element.removeEventListener("click", claimButtonHandler);

      renderTransaction(true);
    } catch (error: any) {
      console.error(error);
      errorToast(error, error.message ?? error);
      resetClaimButton();
    }
  };
}

export async function isNonceRedeemed(nftMint: Erc721Permit): Promise<boolean> {
  const provider = new ethers.providers.JsonRpcProvider(networkRpcs[nftMint.networkId]);
  const nftContract = new ethers.Contract(nftMint.nftAddress, nftRewardAbi, provider);
  return nftContract.nonceRedeemed(nftMint.request.nonce);
}
