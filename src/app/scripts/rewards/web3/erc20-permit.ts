"use client";
import { Permit } from "@ubiquibot/permit-generation/types";
import { BigNumberish, Contract, JsonRpcSigner, TransactionResponse, ethers } from "ethers";
import { erc20Abi, permit2Abi } from "../abis";
import { app, AppState } from "../app-state";
import { permit2Address } from "../constants";
import { supabase } from "../render-transaction/read-claim-data-from-url";
import { getButtonController, errorToast, MetaMaskError, toaster } from "../toaster";

export async function fetchTreasury(permit: Permit): Promise<{ balance: BigNumberish; allowance: BigNumberish; decimals: number; symbol: string }> {
  let balance: BigNumberish, allowance: BigNumberish, decimals: number, symbol: string;

  try {
    const tokenAddress = permit.tokenAddress;
    const tokenContract = new ethers.Contract(tokenAddress, erc20Abi, app.provider);

    // Try to get the token info from localStorage
    const tokenInfo = localStorage.getItem(tokenAddress);

    if (tokenInfo) {
      // If the token info is in localStorage, parse it and use it
      const { decimals: storedDecimals, symbol: storedSymbol } = JSON.parse(tokenInfo);
      decimals = storedDecimals;
      symbol = storedSymbol;
      [balance, allowance] = await Promise.all([tokenContract.balanceOf(permit.owner), tokenContract.allowance(permit.owner, permit2Address)]);
    } else {
      // If the token info is not in localStorage, fetch it from the blockchain
      [balance, allowance, decimals, symbol] = await Promise.all([
        tokenContract.balanceOf(permit.owner),
        tokenContract.allowance(permit.owner, permit2Address),
        tokenContract.decimals(),
        tokenContract.symbol(),
      ]);

      // Store the token info in localStorage for future use
      localStorage.setItem(tokenAddress, JSON.stringify({ decimals, symbol }));
    }

    return { balance, allowance, decimals, symbol };
  } catch (error: unknown) {
    return { balance: -1, allowance: -1, decimals: -1, symbol: "" };
  }
}

async function checkPermitClaimability(app: AppState): Promise<boolean> {
  try {
    return await checkPermitClaimable(app);
  } catch (error: unknown) {
    if (error instanceof Error) {
      const e = error as unknown as MetaMaskError;
      console.error("Error in checkPermitClaimable: ", e);
      errorToast(e, e.reason);
    }
  }
  getButtonController().hideMakeClaim();
  return false;
}

async function transferFromPermit(permit2Contract: Contract, app: AppState) {
  const reward = app.reward;
  try {
    const tx = await permit2Contract.permitTransferFrom(
      {
        permitted: {
          token: reward.tokenAddress,
          amount: reward.amount,
        },
        nonce: reward.nonce,
        deadline: reward.deadline,
      },
      { to: reward.beneficiary, requestedAmount: reward.amount },
      reward.owner,
      reward.signature
    );
    toaster.create("info", `Transaction sent`);
    return tx;
  } catch (error: unknown) {
    if (error instanceof Error) {
      const e = error as unknown as MetaMaskError;
      // Check if the error message indicates a user rejection
      if (e.code == "ACTION_REJECTED") {
        // Handle the user rejection case
        toaster.create("info", `Transaction was not sent because it was rejected by the user.`);
        getButtonController().hideLoader();
        getButtonController().showMakeClaim();
      } else {
        // Handle other errors
        console.error("Error in permitTransferFrom:", e);
        errorToast(e, e.reason);
      }
    }
    return null;
  }
}

async function waitForTransaction(tx: TransactionResponse) {
  try {
    const receipt = await app.provider.waitForTransaction(tx.hash);
    toaster.create("success", `Claim Complete.`);
    getButtonController().hideLoader();
    getButtonController().hideMakeClaim();
    getButtonController().showViewClaim();
    console.log(receipt?.hash);
    return receipt;
  } catch (error: unknown) {
    if (error instanceof Error) {
      const e = error as unknown as MetaMaskError;
      console.error("Error in tx.wait: ", e);
      errorToast(e, e.reason);
    }
  }
}

export async function claimErc20PermitHandlerWrapper(app: AppState) {
  getButtonController().hideMakeClaim();
  getButtonController().showLoader();

  const isPermitClaimable = await checkPermitClaimability(app);
  if (!isPermitClaimable) return;

  const permit2Contract = new ethers.Contract(permit2Address, permit2Abi, app.signer);
  if (!permit2Contract) return;

  const tx = await transferFromPermit(permit2Contract, app);
  if (!tx) return;

  // getButtonController().showLoader();
  // getButtonController().hideMakeClaim();

  const receipt = await waitForTransaction(tx);
  if (!receipt) return;

  const isHashUpdated = await updatePermitTxHash(app, receipt.hash);
  if (!isHashUpdated) return;
}

async function checkPermitClaimable(app: AppState): Promise<boolean> {
  let isClaimed: boolean;
  try {
    isClaimed = await isNonceClaimed(app);
  } catch (error: unknown) {
    console.error("Error in isNonceClaimed: ", error);
    return false;
  }

  if (isClaimed) {
    toaster.create("error", `Your reward for this task has already been claimed.`);
    getButtonController().showViewClaim();
    return false;
  }

  const reward = app.reward;

  if (Number(reward.deadline) < Math.floor(Date.now() / 1000)) {
    toaster.create("error", `This reward has expired.`);
    return false;
  }

  const { balance, allowance } = await fetchTreasury(reward);
  const permitted = reward.amount;

  const isSolvent = balance > permitted;
  const isAllowed = allowance > permitted;

  if (!isSolvent) {
    toaster.create("error", `Not enough funds on funding wallet to collect this reward. Please let the financier know.`);
    getButtonController().hideMakeClaim();
    return false;
  }
  if (!isAllowed) {
    toaster.create("error", `Not enough allowance on the funding wallet to collect this reward. Please let the financier know.`);
    getButtonController().hideMakeClaim();
    return false;
  }

  let user: string;
  try {
    user = (await app.signer.getAddress()).toLowerCase();
  } catch (error: unknown) {
    console.error("Error in signer.getAddress: ", error);
    return false;
  }

  const beneficiary = reward.beneficiary.toLowerCase();
  if (beneficiary !== user) {
    toaster.create("warning", `This reward is not for you.`);
    getButtonController().hideMakeClaim();
    return false;
  }

  return true;
}

export async function checkRenderMakeClaimControl(app: AppState) {
  try {
    const address = await app.signer.getAddress();
    const user = address.toLowerCase();

    if (app.reward) {
      const beneficiary = app.reward.beneficiary.toLowerCase();
      if (beneficiary !== user) {
        getButtonController().hideMakeClaim();
        return;
      }
    }
  } catch (error) {
    console.error("Error getting address from signer");
    console.error(error);
  }
  getButtonController().showMakeClaim();
}

export async function checkRenderInvalidatePermitAdminControl(app: AppState) {
  try {
    const address = await app.signer.getAddress();
    const user = address.toLowerCase();

    if (app.reward) {
      const owner = app.reward.owner.toLowerCase();
      if (owner !== user) {
        getButtonController().hideInvalidator();
        return;
      }
    }
  } catch (error) {
    console.error("Error getting address from signer");
    console.error(error);
  }
  getButtonController().showInvalidator();

  const invalidateButton = document.getElementById("invalidator") as HTMLDivElement;

  invalidateButton.addEventListener("click", async function invalidateButtonClickHandler() {
    try {
      const isClaimed = await isNonceClaimed(app);
      if (isClaimed) {
        toaster.create("error", `This reward has already been claimed or invalidated.`);
        getButtonController().hideInvalidator();
        return;
      }
      await invalidateNonce(app.signer, app.reward.nonce);
    } catch (error: unknown) {
      if (error instanceof Error) {
        const e = error as unknown as MetaMaskError;
        console.error(e);
        errorToast(e, e.reason);
        return;
      }
    }
    toaster.create("info", "Nonce invalidation transaction sent");
    getButtonController().hideInvalidator();
  });
}

//mimics https://github.com/Uniswap/permit2/blob/a7cd186948b44f9096a35035226d7d70b9e24eaf/src/SignatureTransfer.sol#L150
async function isNonceClaimed(app: AppState): Promise<boolean> {
  const provider = app.provider;

  const permit2Contract = new ethers.Contract(permit2Address, permit2Abi, provider);

  const { wordPos, bitPos } = nonceBitmap(app.reward.nonce);

  const bitmap = await permit2Contract.nonceBitmap(app.reward.owner, wordPos).catch((error: MetaMaskError) => {
    console.error("Error in nonceBitmap method: ", error);
    throw error;
  });

  const bit = BigInt(1) << BigInt(bitPos);
  const flipped = bitmap ^ bit;

  return flipped === BigInt(0);
}

async function invalidateNonce(signer: JsonRpcSigner, nonce: BigNumberish): Promise<void> {
  const permit2Contract = new ethers.Contract(permit2Address, permit2Abi, signer);
  const { wordPos, bitPos } = nonceBitmap(nonce);
  // mimics https://github.com/ubiquity/pay.ubq.fi/blob/c9e7ed90718fe977fd9f348db27adf31d91d07fb/scripts/solidity/test/Permit2.t.sol#L428
  const bit = BigInt(1) << BigInt(bitPos);
  const sourceBitmap = await permit2Contract.nonceBitmap(await signer.getAddress(), wordPos.toString());
  const mask = sourceBitmap ^ bit;
  await permit2Contract.invalidateUnorderedNonces(wordPos, mask);
}

// mimics https://github.com/Uniswap/permit2/blob/db96e06278b78123970183d28f502217bef156f4/src/SignatureTransfer.sol#L142
function nonceBitmap(nonce: BigNumberish): { wordPos: BigNumberish; bitPos: number } {
  // wordPos is the first 248 bits of the nonce
  const wordPos = Number(nonce) >> 8;
  // bitPos is the last 8 bits of the nonce
  const bitPos = Number(nonce) & 255;
  return { wordPos, bitPos };
}

async function updatePermitTxHash(app: AppState, hash: string): Promise<boolean> {
  const { error } = await supabase
    .from("permits")
    .update({ transaction: hash })
    // using only nonce in the condition as it's defined unique on db
    .eq("nonce", app.reward.nonce.toString());

  if (error !== null) {
    console.error(error);
    throw error;
  }

  return true;
}
