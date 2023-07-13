import { ethers } from "ethers";

export async function renderTreasuryStatus({ balance, allowance, decimals }: { balance: number; allowance: number; decimals: number }) {
  const trBalance = document.querySelector(".tr-balance") as Element;
  const trAllowance = document.querySelector(".tr-allowance") as Element;
  trBalance.textContent = balance > 0 ? `$${ethers.utils.formatUnits(balance, decimals)}` : "N/A";
  trAllowance.textContent = balance > 0 ? `$${ethers.utils.formatUnits(allowance, decimals)}` : "N/A";
}
