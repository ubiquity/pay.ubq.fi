import { BigNumber, ethers } from "ethers";
import { permit2Abi } from "../abis";
import { networkRpcs, permit2Address } from "../constants";
import { app } from "../render-transaction/index";
import { nonceBitmap } from "./nonce-bitmap";

export async function checkPermitClaimed() {
  // get tx from window
  let tx = app.txData;

  // Set contract address and ABI
  const provider = new ethers.providers.JsonRpcProvider(networkRpcs[app.claimNetworkId]);
  const permit2Contract = new ethers.Contract(permit2Address, permit2Abi, provider);

  const { wordPos, bitPos } = nonceBitmap(BigNumber.from(tx.permit.nonce));
  const bitmap = await permit2Contract.nonceBitmap(app.txData.owner, wordPos);
  const bit = BigNumber.from(1)
    .shl(bitPos - 1)
    .and(bitmap);
  return !bit.eq(0);
}
