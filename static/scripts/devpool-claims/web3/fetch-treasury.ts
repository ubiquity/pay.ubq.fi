import { ethers } from "ethers";
import { daiAbi } from "../abis";
import { networkRpc, permit2Address } from "../constants";
import { app } from "../render-transaction/index";

export async function fetchTreasury(): Promise<{ balance: number; allowance: number; decimals: number }> {
  try {
    const provider = new ethers.providers.JsonRpcProvider(networkRpc[app.claimNetworkId]);
    const tokenAddress = app.txData.permit.permitted.token;
    const tokenContract = new ethers.Contract(tokenAddress, daiAbi, provider);
    const balance = await tokenContract.balanceOf(app.txData.owner);
    const allowance = await tokenContract.allowance(app.txData.owner, permit2Address);
    const decimals = await tokenContract.decimals();
    return { balance, allowance, decimals };
  } catch (error: any) {
    return { balance: -1, allowance: -1, decimals: -1 };
  }
}
