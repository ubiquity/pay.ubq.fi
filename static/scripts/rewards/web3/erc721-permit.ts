import { JsonRpcProvider, TransactionResponse } from "@ethersproject/providers";
import { ERC721Permit } from "@ubiquibot/permit-generation/types";
import { BigNumber, ethers } from "ethers";
import { nftRewardAbi } from "../abis/nft-reward-abi";
import { app } from "../app-state";
import { errorToast, MetaMaskError, toaster } from "../toaster";
import { buttonController, getMakeClaimButton } from "../button-controller";
import { connectWallet } from "./connect-wallet";
import { decodeError } from "@ubiquity-os/ethers-decode-error";

export function claimErc721PermitHandler(reward: ERC721Permit) {
  return async function claimHandler() {
    const signer = await connectWallet();
    if (!signer) {
      return;
    }

    if ((await signer.getAddress()).toLowerCase() !== reward.beneficiary) {
      toaster.create("warning", `This NFT is not for you.`);
      return;
    }

    if (BigNumber.from(reward.deadline).lt(Math.floor(Date.now() / 1000))) {
      toaster.create("error", `This NFT has expired.`);
      return;
    }

    const isRedeemed = await isNonceRedeemed(reward, app.provider);
    if (isRedeemed) {
      toaster.create("error", `This NFT has already been redeemed.`);
      return;
    }

    buttonController.showLoader();
    try {
      const nftContract = new ethers.Contract(reward.tokenAddress, nftRewardAbi, signer);
      const tx: TransactionResponse = await nftContract.safeMint(
        {
          beneficiary: reward.beneficiary,
          deadline: reward.deadline,
          keys: reward.erc721Request?.keys,
          nonce: reward.nonce,
          values: reward.erc721Request?.values,
        },
        reward.signature
      );
      toaster.create("info", `Transaction sent. Waiting for confirmation...`);
      const receipt = await tx.wait();
      buttonController.hideLoader();
      toaster.create("success", `Claim Complete.`);
      buttonController.showViewClaim();
      buttonController.hideMakeClaim();
      console.log(receipt.transactionHash); // @TODO: post to database

      getMakeClaimButton().removeEventListener("click", claimHandler);

      // app.nextPermit();
      // renderTransaction().catch((error) => {
      //   console.error(error);
      //   toaster.create("error", `Error rendering transaction: ${error.message}`);
      // });
    } catch (error: unknown) {
      console.error(error);
      if (error instanceof Error) {
        const e = error as unknown as MetaMaskError;
        if (e.code == "ACTION_REJECTED") {
          // Handle the user rejection case
          toaster.create("info", `Transaction was not sent because it was rejected by the user.`);
          buttonController.hideLoader();
          buttonController.showMakeClaim();
        } else {
          const { error } = decodeError(e, nftRewardAbi);
          errorToast(e, `Error in permitTransferFrom: ${error}`);
        }
      } else if (typeof error === "string") {
        toaster.create("error", `Error claiming NFT: ${error}`);
      } else {
        toaster.create("error", `Error claiming NFT: Unknown error`);
      }
    }
  };
}

async function isNonceRedeemed(reward: ERC721Permit, provider: JsonRpcProvider): Promise<boolean> {
  const nftContract = new ethers.Contract(reward.tokenAddress, nftRewardAbi, provider);
  return nftContract.nonceRedeemed(reward.nonce);
}
