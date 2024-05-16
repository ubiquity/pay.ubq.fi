import { ethers } from "ethers";

export function getGiftCardOrderId(rewardToAddress: string, signature: string) {
  const checksumAddress = ethers.utils.getAddress(rewardToAddress);
  const integrityString = checksumAddress + ":" + signature;
  const integrityBytes = ethers.utils.toUtf8Bytes(integrityString);
  return ethers.utils.keccak256(integrityBytes);
}

export function getMessageToSign(transactionId: number) {
  return JSON.stringify({
    from: "pay.ubq.fi",
    transactionId: transactionId,
  });
}
