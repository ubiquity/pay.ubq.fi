import { BigNumber, ethers } from "ethers";
import { permit2Abi } from "../abis";
import { networkRpcs, permit2Address } from "../constants";
import { app } from "../render-transaction/index";
import { nonceBitmap } from "./nonce-bitmap";

export async function checkPermitClaimable() {
  // Set contract address and ABI
  const networkId = app.claimNetworkId;
  if (!networkId) {
    throw new Error("No network ID provided");
  }

  const provider = new ethers.providers.JsonRpcProvider(networkRpcs[networkId]);
  const permit2Contract = new ethers.Contract(permit2Address, permit2Abi, provider);

  const { wordPos, bitPos } = nonceBitmap(BigNumber.from(app.txData.permit.nonce));
  const bitmap = await permit2Contract.nonceBitmap(app.txData.owner, wordPos);

  const bit = BigNumber.from(1).shl(bitPos).and(bitmap);

  return bit.eq(0);
}
