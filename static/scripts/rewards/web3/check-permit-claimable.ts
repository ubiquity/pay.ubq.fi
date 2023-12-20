import { BigNumber, ethers } from "ethers";
import { permit2Abi } from "../abis";
import { networkRpcs, permit2Address } from "../constants";
import { app } from "../render-transaction/index";
import { nonceBitmap } from "./nonce";
import { Permit } from "../render-transaction/tx-type";

export async function checkPermitClaimable(permit: Permit) {
  // Set contract address and ABI
  const networkId = permit.networkId;
  if (!networkId) {
    throw new Error("No network ID provided");
  }

  const provider = new ethers.providers.JsonRpcProvider(networkRpcs[networkId]);
  const permit2Contract = new ethers.Contract(permit2Address, permit2Abi, provider);

  const { wordPos, bitPos } = nonceBitmap(BigNumber.from(permit.permit.nonce));
  const bitmap = await permit2Contract.nonceBitmap(permit.owner, wordPos);

  const bit = BigNumber.from(1).shl(bitPos).and(bitmap);

  return bit.eq(0);
}
