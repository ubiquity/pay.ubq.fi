import { ethers } from "ethers";
import { RPCHandler } from "@ubiquity-dao/rpc-handler";

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

export async function getFastestRpcUrl(networkId: string | number) {
  const config = {
    networkId: networkId,
    autoStorage: true,
    cacheRefreshCycles: 5,
    rpcTimeout: 1500,
    networkName: null,
    runtimeRpcs: null,
    networkRpcs: null,
  };

  const handler = new RPCHandler(config);
  const provider = await handler.getFastestRpcProvider();
  return provider.connection.url;
}
