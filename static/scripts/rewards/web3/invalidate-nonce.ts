import { PERMIT2_ADDRESS } from "@uniswap/permit2-sdk";
import { BigNumber, ethers } from "ethers";
import { permit2Abi } from "../abis";
import { nonceBitmap } from "./nonce-bitmap";

export async function invalidateNonce(signer: ethers.providers.JsonRpcSigner, nonce: BigNumber): Promise<void> {
  const permit2Contract = new ethers.Contract(PERMIT2_ADDRESS, permit2Abi, signer);
  const { wordPos, bitPos } = nonceBitmap(nonce);
  await permit2Contract.invalidateUnorderedNonces(wordPos, bitPos);
}
