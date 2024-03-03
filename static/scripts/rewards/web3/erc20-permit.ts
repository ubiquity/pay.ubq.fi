import { JsonRpcSigner, TransactionResponse } from "@ethersproject/providers";
import { BigNumber, BigNumberish, Contract, ethers } from "ethers";
import { permit2Abi } from "../abis";
import { AppState } from "../app-state";
import { permit2Address } from "../constants";
import invalidateButton from "../invalidate-component";
import { tokens } from "../render-transaction/render-token-symbol";
import { renderTransaction } from "../render-transaction/render-transaction";
import { getErc20Contract } from "../rpc-optimization/getErc20Contract";
import { MetaMaskError, claimButton, errorToast, showLoader, toaster } from "../toaster";

export async function fetchFundingWallet(app: AppState): Promise<{ balance: BigNumber; allowance: BigNumber; decimals: number; symbol: string }> {
  const reward = app.reward;
  try {
    const tokenAddress = reward.permit.permitted.token.toLowerCase();
    const tokenContract = await getErc20Contract(tokenAddress, app.provider);

    if (tokenAddress === tokens[0].address || tokenAddress === tokens[1].address) {
      const decimals = tokenAddress === tokens[0].address ? 18 : tokenAddress === tokens[1].address ? 18 : -1;
      const symbol = tokenAddress === tokens[0].address ? tokens[0].name : tokenAddress === tokens[1].address ? tokens[1].name : "";

      const [balance, allowance] = await Promise.all([tokenContract.balanceOf(reward.owner), tokenContract.allowance(reward.owner, permit2Address)]);

      return { balance, allowance, decimals, symbol };
    } else {
      console.log(`Hardcode this token in render-token-symbol.ts and save two calls: ${tokenAddress}`);
      const [balance, allowance, decimals, symbol] = await Promise.all([
        tokenContract.balanceOf(reward.owner),
        tokenContract.allowance(reward.owner, permit2Address),
        tokenContract.decimals(),
        tokenContract.symbol(),
      ]);

      return { balance, allowance, decimals, symbol };
    }
  } catch (error: unknown) {
    return { balance: BigNumber.from(-1), allowance: BigNumber.from(-1), decimals: -1, symbol: "" };
  }
}

async function checkPermitClaimability(app: AppState): Promise<boolean> {
  let isPermitClaimable = false;
  try {
    isPermitClaimable = await checkPermitClaimable(app);
  } catch (error: unknown) {
    if (error instanceof Error) {
      const e = error as unknown as MetaMaskError;
      console.error("Error in checkPermitClaimable: ", e);
      errorToast(e, e.reason);
    }
  }
  return isPermitClaimable;
}

async function createEthersContract(signer: JsonRpcSigner) {
  let permit2Contract;
  try {
    permit2Contract = new ethers.Contract(permit2Address, permit2Abi, signer);
  } catch (error: unknown) {
    if (error instanceof Error) {
      const e = error as unknown as MetaMaskError;
      console.error("Error in creating ethers.Contract: ", e);
      errorToast(e, e.reason);
    }
  }
  return permit2Contract;
}

async function transferFromPermit(permit2Contract: Contract, app: AppState) {
  const reward = app.reward;
  try {
    const tx = await permit2Contract.permitTransferFrom(reward.permit, reward.transferDetails, reward.owner, reward.signature);
    toaster.create("info", `Transaction sent`);
    return tx;
  } catch (error: unknown) {
    if (error instanceof Error) {
      const e = error as unknown as MetaMaskError;
      // Check if the error message indicates a user rejection
      if (e.code == "ACTION_REJECTED") {
        // Handle the user rejection case
        toaster.create("info", `Transaction was not sent because it was rejected by the user.`);
      } else {
        // Handle other errors
        console.error("Error in permitTransferFrom: ", e);
        errorToast(e, e.reason);
      }
    }
    return null;
  }
}

async function waitForTransaction(tx: TransactionResponse) {
  let receipt;
  try {
    receipt = await tx.wait();
    toaster.create("success", `Claim Complete.`);
    console.log(receipt.transactionHash); // @TODO: post to database
  } catch (error: unknown) {
    if (error instanceof Error) {
      const e = error as unknown as MetaMaskError;
      console.error("Error in tx.wait: ", e);
      errorToast(e, e.reason);
    }
  }
  return receipt;
}

async function renderTx(app: AppState) {
  try {
    app.claims.slice(0, 1);
    await renderTransaction(app, true);
  } catch (error: unknown) {
    if (error instanceof Error) {
      const e = error as unknown as MetaMaskError;
      console.error("Error in renderTransaction: ", e);
      errorToast(e, e.reason);
    }
  }
}

export function claimErc20PermitHandlerWrapper(app: AppState) {
  return async function claimErc20PermitHandler() {
    showLoader();

    const isPermitClaimable = await checkPermitClaimability(app);
    if (!isPermitClaimable) return;

    const permit2Contract = await createEthersContract(app.signer);
    if (!permit2Contract) return;

    const tx = await transferFromPermit(permit2Contract, app);
    if (!tx) return;

    const receipt = await waitForTransaction(tx);
    if (!receipt) return;

    claimButton.element.removeEventListener("click", claimErc20PermitHandler);

    await renderTx(app);
  };
}

export async function checkPermitClaimable(app: AppState): Promise<boolean> {
  let isClaimed;
  try {
    isClaimed = await isNonceClaimed(app);
  } catch (error: unknown) {
    console.error("Error in isNonceClaimed: ", error);
    return false;
  }

  if (isClaimed) {
    toaster.create("error", `Your reward for this task has already been claimed or invalidated.`);
    return false;
  }

  const reward = app.reward;

  if (reward.permit.deadline.lt(Math.floor(Date.now() / 1000))) {
    toaster.create("error", `This reward has expired.`);
    return false;
  }

  let treasury;
  try {
    treasury = await fetchFundingWallet(app);
  } catch (error: unknown) {
    console.error("Error in fetchTreasury: ", error);
    return false;
  }

  const { balance, allowance } = treasury;
  const permitted = BigNumber.from(reward.permit.permitted.amount);
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

  let user;
  try {
    user = (await app.signer.getAddress()).toLowerCase();
  } catch (error: unknown) {
    console.error("Error in signer.getAddress: ", error);
    return false;
  }

  const beneficiary = reward.transferDetails.to.toLowerCase();
  if (beneficiary !== user) {
    toaster.create("warning", `This reward is not for you.`);
    return false;
  }

  return true;
}

export async function generateInvalidatePermitAdminControl(app: AppState) {
  try {
    const address = await app.signer.getAddress();
    const user = address.toLowerCase();

    if (app.reward) {
      const owner = app.reward.owner.toLowerCase();
      if (owner !== user) {
        return;
      }
    }
  } catch (error) {
    console.error("Error getting address from signer");
    console.error(error);
  }

  const controls = document.getElementById("controls") as HTMLDivElement;
  controls.appendChild(invalidateButton);

  invalidateButton.addEventListener("click", async function invalidateButtonClickHandler() {
    try {
      const isClaimed = await isNonceClaimed(app);
      if (isClaimed) {
        toaster.create("error", `This reward has already been claimed or invalidated.`);
        return;
      }
      await invalidateNonce(app.signer, app.reward.permit.nonce);
    } catch (error: unknown) {
      if (error instanceof Error) {
        const e = error as unknown as MetaMaskError;
        console.error(e);
        errorToast(e, e.reason);
        return;
      }
    }
    toaster.create("info", "Nonce invalidation transaction sent");
  });
}

//mimics https://github.com/Uniswap/permit2/blob/a7cd186948b44f9096a35035226d7d70b9e24eaf/src/SignatureTransfer.sol#L150
export async function isNonceClaimed(app: AppState): Promise<boolean> {
  const provider = app.provider;

  const permit2Contract = new ethers.Contract(permit2Address, permit2Abi, provider);

  const { wordPos, bitPos } = nonceBitmap(BigNumber.from(app.reward.permit.nonce));

  const bitmap = await permit2Contract.nonceBitmap(app.reward.owner, wordPos).catch((error: MetaMaskError) => {
    console.error("Error in nonceBitmap method: ", error);
    throw error;
  });

  const bit = BigNumber.from(1).shl(bitPos);
  const flipped = BigNumber.from(bitmap).xor(bit);

  return bit.and(flipped).eq(0);
}

export async function invalidateNonce(signer: JsonRpcSigner, nonce: BigNumberish): Promise<void> {
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
