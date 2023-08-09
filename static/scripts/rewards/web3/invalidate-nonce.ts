import { PERMIT2_ADDRESS } from "@uniswap/permit2-sdk";
import { BigNumber, ethers } from "ethers";
import { permit2Abi } from "../abis";
import { nonceBitmap } from "./nonce-bitmap";

export async function invalidateNonce(signer: ethers.providers.JsonRpcSigner, nonce: BigNumber): Promise<void> {
  const permit2Contract = new ethers.Contract(PERMIT2_ADDRESS, permit2Abi, signer);
  const { wordPos, bitPos } = nonceBitmap(nonce);
  // mimics https://github.com/ubiquity/pay.ubq.fi/blob/c9e7ed90718fe977fd9f348db27adf31d91d07fb/scripts/solidity/test/Permit2.t.sol#L428
  const bit = BigNumber.from(1).shl(bitPos);
  const sourceBitmap = await permit2Contract.nonceBitmap(await signer.getAddress(), wordPos.toString());
  const mask = sourceBitmap.or(bit);
  await permit2Contract.invalidateUnorderedNonces(wordPos, mask);
}
