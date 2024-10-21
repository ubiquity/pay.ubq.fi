import { JsonRpcSigner, TransactionResponse } from "@ethersproject/providers";
import { Permit } from "@ubiquibot/permit-generation/types";
import { BigNumber, BigNumberish, Contract, ethers } from "ethers";
import { erc20Abi, permit2Abi } from "../abis";
import { app, AppState } from "../app-state";
import { getNetworkExplorer, permit2Address } from "@ubiquity-dao/rpc-handler";
import { supabase } from "../render-transaction/read-claim-data-from-url";
import { buttonController, getMakeClaimButton, viewClaimButton } from "../button-controller";
import { toaster, errorToast, MetaMaskError } from "../toaster";
import { connectWallet } from "./connect-wallet";
import { convertToNetworkId } from "./use-rpc-handler";

export async function fetchTreasury(permit: Permit): Promise<{ balance: BigNumber; allowance: BigNumber; decimals: number; symbol: string }> {
  let balance: BigNumber, allowance: BigNumber, decimals: number, symbol: string;

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
    return { balance: BigNumber.from(-1), allowance: BigNumber.from(-1), decimals: -1, symbol: "" };
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
  buttonController.hideMakeClaim();
  return false;
}

export async function transferFromPermit(permit2Contract: Contract, reward: Permit, successMessage?: string) {
  const signer = app.signer;
  if (!signer) return null;

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
    toaster.create("info", successMessage ?? `Transaction sent`);
    return tx;
  } catch (error: unknown) {
    if (error instanceof Error) {
      const e = error as unknown as MetaMaskError;
      // Check if the error message indicates a user rejection
      if (e.code == "ACTION_REJECTED") {
        // Handle the user rejection case
        toaster.create("info", `Transaction was not sent because it was rejected by the user.`);
        buttonController.hideLoader();
        buttonController.showMakeClaim();
      } else {
        // Handle other errors
        console.error("Error in permitTransferFrom:", e);
        errorToast(e, e.reason);
      }
    }
    return null;
  }
}

export async function waitForTransaction(tx: TransactionResponse, successMessage: string, networkId: number) {
  try {
    const receipt = await tx.wait();
    const networkExplorers = getNetworkExplorer(convertToNetworkId(networkId));

    if (networkExplorers.length === 0) {
      viewClaimButton.onclick = () => {
        window.open(`https://blockscan/com/tx/${receipt.transactionHash}`, "_blank");
      };
      toaster.create("info", "We had to use a fallback block explorer which may take longer to populate your transaction.");
    } else {
      viewClaimButton.onclick = () => {
        window.open(`${networkExplorers[0].url}/tx/${receipt.transactionHash}`, "_blank");
      };
    }

    toaster.create("success", successMessage);
    buttonController.showViewClaim();
    buttonController.hideLoader();
    buttonController.hideMakeClaim();
    console.log(receipt.transactionHash);

    return receipt;
  } catch (error: unknown) {
    if (error instanceof Error) {
      const e = error as unknown as MetaMaskError;
      console.error("Error in tx.wait: ", e);
      errorToast(e, e.reason);
    }
  }
}

export function claimErc20PermitHandlerWrapper(app: AppState) {
  return async function claimErc20PermitHandler() {
    const signer = await connectWallet(); // we are re-testing the in-wallet rpc at this point
    if (!signer) {
      buttonController.hideAll();
      toaster.create("error", `Please connect your wallet to claim this reward.`);
      return;
    }

    app.signer = signer; // update this here to be sure it's set if it wasn't before

    buttonController.hideMakeClaim();
    buttonController.showLoader();

    const isPermitClaimable = await checkPermitClaimability(app);
    if (!isPermitClaimable) return;

    const permit2Contract = new ethers.Contract(permit2Address, permit2Abi, signer);
    if (!permit2Contract) return;

    const tx = await transferFromPermit(permit2Contract, app.reward);
    if (!tx) return;

    const receipt = await waitForTransaction(tx, `Claim Complete.`, app.reward.networkId);
    if (!receipt) return;

    const isHashUpdated = await updatePermitTxHash(app, receipt.transactionHash);
    if (!isHashUpdated) return;

    getMakeClaimButton().removeEventListener("click", claimErc20PermitHandler);
  };
}

export async function checkPermitClaimable(app: AppState): Promise<boolean> {
  let isClaimed: boolean;
  try {
    isClaimed = await isNonceClaimed(app);
  } catch (error: unknown) {
    console.error("Error in isNonceClaimed: ", error);
    return false;
  }

  if (isClaimed) {
    toaster.create("error", `Your reward for this task has already been claimed.`);
    buttonController.showViewClaim();
    return false;
  }

  const reward = app.reward;

  if (BigNumber.from(reward.deadline).lt(Math.floor(Date.now() / 1000))) {
    toaster.create("error", `This reward has expired.`);
    return false;
  }

  const { balance, allowance } = await fetchTreasury(reward);
  const permitted = BigNumber.from(reward.amount);

  const isSolvent = balance.gte(permitted);
  const isAllowed = allowance.gte(permitted);

  if (!isSolvent) {
    toaster.create("error", `Not enough funds on funding wallet to collect this reward. Please let the financier know.`);
    buttonController.hideMakeClaim();
    return false;
  }
  if (!isAllowed) {
    toaster.create("error", `Not enough allowance on the funding wallet to collect this reward. Please let the financier know.`);
    buttonController.hideMakeClaim();
    return false;
  }

  let user: string | undefined;
  try {
    const address = await app.signer?.getAddress();
    user = address?.toLowerCase();
  } catch (error: unknown) {
    console.error("Error in signer.getAddress: ", error);
    return false;
  }

  const beneficiary = reward.beneficiary.toLowerCase();
  if (beneficiary !== user) {
    toaster.create("warning", `This reward is not for you.`);
    buttonController.hideMakeClaim();
    return false;
  }

  return true;
}

export async function checkRenderMakeClaimControl(app: AppState) {
  try {
    const address = await app.signer?.getAddress();
    const user = address?.toLowerCase();

    if (app.reward) {
      const beneficiary = app.reward.beneficiary.toLowerCase();
      if (beneficiary !== user) {
        buttonController.hideMakeClaim();
        return;
      }
    }
  } catch (error) {
    console.error("Error getting address from signer");
    console.error(error);
  }
  buttonController.showMakeClaim();
}

export async function checkRenderInvalidatePermitAdminControl(app: AppState) {
  try {
    const address = await app.signer?.getAddress();
    const user = address?.toLowerCase();

    if (app.reward) {
      const owner = app.reward.owner.toLowerCase();
      if (owner !== user) {
        buttonController.hideInvalidator();
        return;
      }
    }
  } catch (error) {
    console.error("Error getting address from signer");
    console.error(error);
  }
  buttonController.showInvalidator();
}

const invalidateButton = document.getElementById("invalidator") as HTMLDivElement;

invalidateButton.addEventListener("click", async function invalidateButtonClickHandler() {
  try {
    const isClaimed = await isNonceClaimed(app);
    if (isClaimed) {
      toaster.create("error", `This reward has already been claimed or invalidated.`);
      buttonController.hideInvalidator();
      return;
    }

    if (!app.signer) return;
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
  buttonController.hideInvalidator();
});

//mimics https://github.com/Uniswap/permit2/blob/a7cd186948b44f9096a35035226d7d70b9e24eaf/src/SignatureTransfer.sol#L150
export async function isNonceClaimed(app: AppState): Promise<boolean> {
  const provider = app.provider;

  const permit2Contract = new ethers.Contract(permit2Address, permit2Abi, provider);

  const { wordPos, bitPos } = nonceBitmap(BigNumber.from(app.reward.nonce));

  const bitmap = await permit2Contract.nonceBitmap(app.reward.owner, wordPos).catch((error: MetaMaskError) => {
    console.error("Error in nonceBitmap method: ", error);
    throw error;
  });

  const bit = BigNumber.from(1).shl(bitPos);
  const flipped = BigNumber.from(bitmap).xor(bit);

  return bit.and(flipped).eq(0);
}

async function invalidateNonce(signer: JsonRpcSigner, nonce: BigNumberish): Promise<void> {
  const permit2Contract = new ethers.Contract(permit2Address, permit2Abi, signer);
  const { wordPos, bitPos } = nonceBitmap(nonce);
  // mimics https://github.com/ubiquity/pay.ubq.fi/blob/c9e7ed90718fe977fd9f348db27adf31d91d07fb/scripts/solidity/test/Permit2.t.sol#L428
  const bit = BigNumber.from(1).shl(bitPos);
  const sourceBitmap = await permit2Contract.nonceBitmap(await signer.getAddress(), wordPos.toString());
  const mask = sourceBitmap.or(bit);
  await permit2Contract.invalidateUnorderedNonces(wordPos, mask);
}

// mimics https://github.com/Uniswap/permit2/blob/db96e06278b78123970183d28f502217bef156f4/src/SignatureTransfer.sol#L142
function nonceBitmap(nonce: BigNumberish): { wordPos: BigNumber; bitPos: number } {
  // wordPos is the first 248 bits of the nonce
  const wordPos = BigNumber.from(nonce).shr(8);
  // bitPos is the last 8 bits of the nonce
  const bitPos = BigNumber.from(nonce).and(255).toNumber();
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
  }

  return true;
}
