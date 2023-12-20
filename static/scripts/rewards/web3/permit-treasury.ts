import { BigNumber, ethers } from "ethers";
import { Permit } from "../render-transaction/tx-type";
import { networkRpcs, permit2Address } from "../constants";
import { daiAbi } from "../abis";

export async function fetchTreasury(permit: Permit): Promise<{ balance: BigNumber; allowance: BigNumber; decimals: number }> {
  try {
    const provider = new ethers.providers.JsonRpcProvider(networkRpcs[permit.networkId]);
    const tokenAddress = permit.permit.permitted.token;
    const tokenContract = new ethers.Contract(tokenAddress, daiAbi, provider);
    const balance = await tokenContract.balanceOf(permit.owner);
    const allowance = await tokenContract.allowance(permit.owner, permit2Address);
    const decimals = await tokenContract.decimals();
    return { balance, allowance, decimals };
  } catch (error: any) {
    return { balance: BigNumber.from(-1), allowance: BigNumber.from(-1), decimals: -1 };
  }
}

export async function renderTreasuryStatus({ balance, allowance, decimals }: { balance: BigNumber; allowance: BigNumber; decimals: number }) {
  const trBalance = document.querySelector(".tr-balance") as Element;
  const trAllowance = document.querySelector(".tr-allowance") as Element;
  trBalance.textContent = balance.gte(0) ? `$${ethers.utils.formatUnits(balance, decimals)}` : "N/A";
  trAllowance.textContent = balance.gte(0) ? `$${ethers.utils.formatUnits(allowance, decimals)}` : "N/A";
}
