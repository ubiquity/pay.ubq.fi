import { BigNumber, BigNumberish, ethers } from "ethers";
import { permit2Abi } from "../abis";
import { permit2Address } from "../constants";
import { getErc20Contract, getOptimalProvider, getExplorerLinkForTx, shortenTxHash } from "../helpers";
import { Erc20Permit } from "../render-transaction/tx-type";
import { toaster, resetClaimButton, errorToast, loadingClaimButton, claimButton } from "../toaster";
import { renderTransaction } from "../render-transaction/render-transaction";
import { connectWallet } from "./wallet";
import invalidateButton from "../invalidate-component";
import { JsonRpcProvider } from "@ethersproject/providers";
import { tokens } from "../render-transaction/render-token-symbol";
import { createClient } from "@supabase/supabase-js";

declare const SUPABASE_URL: string;
declare const SUPABASE_ANON_KEY: string;

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export async function fetchTreasury(
  permit: Erc20Permit,
  provider: JsonRpcProvider
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
  } catch (error: unknown) {
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

      await updatePermitTxHash(permit, receipt.transactionHash);

      claimButton.element.removeEventListener("click", handler);
      renderTransaction(provider).catch(console.error);
    } catch (error: unknown) {
      if (error instanceof Error) {
        console.log(error);
        errorToast(error, error.message);
        resetClaimButton();
      }
    }
  };
}

export async function checkPermitClaimable(permit: Erc20Permit, signer: ethers.providers.JsonRpcSigner | null, provider: JsonRpcProvider) {
  const permitHash = await doesPermitHaveTxHash(permit);
  if (permitHash !== null) {
    const explorerLink = `<a href="${getExplorerLinkForTx(permit.networkId, permitHash)}" target=_blank >${shortenTxHash(permitHash)}</a>`;
    toaster.create("error", `This reward has already been claimed. Transaction hash: ${explorerLink}`);
    return false;
  }

  const isClaimed = await isNonceClaimed(permit);
  if (isClaimed) {
    toaster.create("error", `Your reward for this task has already been claimed or invalidated.`);
    return false;
  }

  if (permit.permit.deadline.lt(Math.floor(Date.now() / 1000))) {
    toaster.create("error", `This reward has expired.`);
    return false;
  }

  const { balance, allowance } = await fetchTreasury(permit, provider);
  const permitted = BigNumber.from(permit.permit.permitted.amount);
  const isSolvent = balance.gte(permitted);
  const isAllowed = allowance.gte(permitted);

  if (!isSolvent) {
    toaster.create("error", `Not enough funds on funding wallet to collect this reward. Please let the financier know.`);
    return false;
  }
  if (!isAllowed) {
    toaster.create("error", `Not enough allowance on the funding wallet to collect this reward. Please let the financier know.`);
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
      const isClaimed = await isNonceClaimed(permit);
      if (isClaimed) {
        toaster.create("error", `This reward has already been claimed or invalidated.`);
        return;
      }
      await invalidateNonce(signer, permit.permit.nonce);
    } catch (error: unknown) {
      if (error instanceof Error) {
        console.log(error);
        errorToast(error, error.message);
        return;
      }
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

export async function doesPermitHaveTxHash(permit: Erc20Permit): Promise<string | null> {
  const { data, error } = await supabase
    .from("permits")
    .select("transaction")
    // using only nonce in the condition as it's defined unique on db
    .eq("nonce", permit.permit.nonce.toString());

  if (data?.length == 1 && data[0].transaction !== null) {
    return data[0].transaction;
  }

  if (error !== null) {
    console.error(error);
    throw error;
  }

  return null;
}

export async function updatePermitTxHash(permit: Erc20Permit, hash: string): Promise<void> {
  const { error } = await supabase
    .from("permits")
    .update({ transaction: hash })
    // using only nonce in the condition as it's defined unique on db
    .eq("nonce", permit.permit.nonce.toString());

  if (error !== null) {
    console.error(error);
    throw error;
  } else {
    return;
  }
}
