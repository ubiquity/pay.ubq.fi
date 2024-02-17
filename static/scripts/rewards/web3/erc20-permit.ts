import { BigNumber, BigNumberish, ethers } from "ethers";
import { erc20Abi, permit2Abi } from "../abis";
import { permit2Address } from "../constants";
import { getErc20Contract, getOptimalProvider } from "../helpers";
import { Erc20Permit } from "../render-transaction/tx-type";
import { toaster, resetClaimButton, errorToast, loadingClaimButton, claimButton } from "../toaster";
import { renderTransaction } from "../render-transaction/render-transaction";
import { connectWallet } from "./wallet";
import invalidateButton from "../invalidate-component";
import { JsonRpcProvider } from "@ethersproject/providers";
import { tokens } from "../render-transaction/render-token-symbol";

export async function fetchTreasury(
  permit: Erc20Permit,
  provider: JsonRpcProvider,
): Promise<{ balance: BigNumber; allowance: BigNumber; decimals: number; symbol: string }> {
  try {
    const tokenAddress = permit.permit.permitted.token.toLowerCase();
    const tokenContract = await getErc20Contract(tokenAddress, provider);

    if (tokenAddress === tokens[0].address || tokenAddress === tokens[1].address) {
      const decimals = tokenAddress === tokens[0].address ? 18 : tokenAddress === tokens[1].address ? 18 : -1;
      const symbol = tokenAddress === tokens[0].address ? tokens[0].name : tokenAddress === tokens[1].address ? tokens[1].name : "";

      const [balance, allowance] = await Promise.all([tokenContract.balanceOf(permit.owner), tokenContract.allowance(permit.owner, permit2Address)]);

      return { balance, allowance, decimals, symbol };
    } else {
      console.log(`Hardcode this token in render-token-symbol.ts and save two calls: ${tokenAddress}`);
      const [balance, allowance, decimals, symbol] = await Promise.all([
        tokenContract.balanceOf(permit.owner),
        tokenContract.allowance(permit.owner, permit2Address),
        tokenContract.decimals(),
        tokenContract.symbol(),
      ]);

      return { balance, allowance, decimals, symbol };
    }
  } catch (error: any) {
    return { balance: BigNumber.from(-1), allowance: BigNumber.from(-1), decimals: -1, symbol: "" };
  }
}

export function claimErc20PermitHandler(permit: Erc20Permit, provider: JsonRpcProvider) {
  return async function handler() {
    try {
      const signer = await connectWallet();
      if (!signer) {
        return;
      }

      if (!(await checkPermitClaimable(permit, signer, provider))) {
        return;
      }

      loadingClaimButton();
      const permit2Contract = new ethers.Contract(permit2Address, permit2Abi, signer);
      const tx = await permit2Contract.permitTransferFrom(permit.permit, permit.transferDetails, permit.owner, permit.signature);
      toaster.create("info", `Transaction sent`);
      const receipt = await tx.wait();
      toaster.create("success", `Claim Complete.`);
      console.log(receipt.transactionHash); // @TODO: post to database

      claimButton.element.removeEventListener("click", handler);
      renderTransaction(provider);
    } catch (error: any) {
      console.log(error);
      errorToast(error, error.message);
      resetClaimButton();
    }
  };
}

export async function checkPermitClaimable(permit: Erc20Permit, signer: ethers.providers.JsonRpcSigner | null, provider: JsonRpcProvider) {
  const claimed = await isNonceClaimed(permit);
  if (claimed) {
    toaster.create("error", `Your reward for this task has already been claimed or invalidated.`);
    return false;
  }

  if (permit.permit.deadline.lt(Math.floor(Date.now() / 1000))) {
    toaster.create("error", `This reward has expired.`);
    return false;
  }

  const { balance, allowance } = await fetchTreasury(permit, provider);
  const permitted = BigNumber.from(permit.permit.permitted.amount);
  const solvent = balance.gte(permitted);
  const allowed = allowance.gte(permitted);

  if (!solvent) {
    toaster.create("error", `Not enough funds on funding wallet to collect this reward. Please let the funder know.`);
    return false;
  }
  if (!allowed) {
    toaster.create("error", `Not enough allowance on the funding wallet to collect this reward. Please let the funder know.`);
    return false;
  }

  if (signer) {
    const user = (await signer.getAddress()).toLowerCase();
    const beneficiary = permit.transferDetails.to.toLowerCase();
    if (beneficiary !== user) {
      toaster.create("warning", `This reward is not for you.`);
      return false;
    }
  }

  return true;
}

export async function generateInvalidatePermitAdminControl(permit: Erc20Permit) {
  const signer = await connectWallet();
  if (!signer) {
    return;
  }

  const user = (await signer.getAddress()).toLowerCase();
  const owner = permit.owner.toLowerCase();
  if (owner !== user) {
    return;
  }

  const controls = document.getElementById("controls") as HTMLDivElement;
  controls.appendChild(invalidateButton);

  invalidateButton.addEventListener("click", async function invalidateButtonClickHandler() {
    try {
      const signer = await connectWallet();
      if (!signer) {
        return;
      }
      const claimed = await isNonceClaimed(permit);
      if (claimed) {
        toaster.create("error", `This reward has already been claimed or invalidated.`);
        return;
      }
      await invalidateNonce(signer, permit.permit.nonce);
    } catch (error: any) {
      toaster.create("error", `${error.reason ?? error.message ?? "Unknown error"}`);
      return;
    }
    toaster.create("info", "Nonce invalidation transaction sent");
  });
}

//mimics https://github.com/Uniswap/permit2/blob/a7cd186948b44f9096a35035226d7d70b9e24eaf/src/SignatureTransfer.sol#L150
export async function isNonceClaimed(permit: Erc20Permit): Promise<boolean> {
  const provider = await getOptimalProvider(permit.networkId);

  const permit2Contract = new ethers.Contract(permit2Address, permit2Abi, provider);

  const { wordPos, bitPos } = nonceBitmap(BigNumber.from(permit.permit.nonce));
  const bitmap = await permit2Contract.nonceBitmap(permit.owner, wordPos);

  const bit = BigNumber.from(1).shl(bitPos);
  const flipped = BigNumber.from(bitmap).xor(bit);

  return bit.and(flipped).eq(0);
}

export async function invalidateNonce(signer: ethers.providers.JsonRpcSigner, nonce: BigNumberish): Promise<void> {
  const permit2Contract = new ethers.Contract(permit2Address, permit2Abi, signer);
  const { wordPos, bitPos } = nonceBitmap(nonce);
  // mimics https://github.com/ubiquity/pay.ubq.fi/blob/c9e7ed90718fe977fd9f348db27adf31d91d07fb/scripts/solidity/test/Permit2.t.sol#L428
  const bit = BigNumber.from(1).shl(bitPos);
  const sourceBitmap = await permit2Contract.nonceBitmap(await signer.getAddress(), wordPos.toString());
  const mask = sourceBitmap.or(bit);
  await permit2Contract.invalidateUnorderedNonces(wordPos, mask);
}

// mimics https://github.com/Uniswap/permit2/blob/db96e06278b78123970183d28f502217bef156f4/src/SignatureTransfer.sol#L142
export function nonceBitmap(nonce: BigNumberish): { wordPos: BigNumber; bitPos: number } {
  // wordPos is the first 248 bits of the nonce
  const wordPos = BigNumber.from(nonce).shr(8);
  // bitPos is the last 8 bits of the nonce
  const bitPos = BigNumber.from(nonce).and(255).toNumber();
  return { wordPos, bitPos };
}
