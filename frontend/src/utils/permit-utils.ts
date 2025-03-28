import { readContract } from '@wagmi/core';
import { erc20Abi } from 'viem';
import type { PermitData } from '../../../shared/types';
import { config } from '../main'; // Assuming config is exported from main.tsx

const PERMIT2_ADDRESS = '0x000000000022D473030F116dDEE9F6B43aC78BA3'; // Universal Permit2 address

/**
 * Checks owner balance and Permit2 allowance for an ERC20 permit.
 * Returns an object with boolean flags or an error string.
 */
export async function checkPermitPrerequisites(permit: PermitData): Promise<{ ownerBalanceSufficient?: boolean; permit2AllowanceSufficient?: boolean; checkError?: string }> {
  if (permit.type !== 'erc20-permit' || !permit.token?.address || !permit.amount) {
    // Not applicable for non-ERC20 or missing data, return empty object.
    return {};
  }

  try {
    const requiredAmount = BigInt(permit.amount);
    const ownerAddress = permit.owner as `0x${string}`;
    const tokenAddress = permit.token.address as `0x${string}`;
    const networkId = permit.networkId as (1 | 100); // Cast for config

    // Check balance
    const balance = await readContract(config, {
      abi: erc20Abi,
      address: tokenAddress,
      functionName: 'balanceOf',
      args: [ownerAddress],
      chainId: networkId,
    });
    const ownerBalanceSufficient = BigInt(balance) >= requiredAmount;

    // Check allowance
    const allowance = await readContract(config, {
      abi: erc20Abi,
      address: tokenAddress,
      functionName: 'allowance',
      args: [ownerAddress, PERMIT2_ADDRESS],
      chainId: networkId,
    });
    const permit2AllowanceSufficient = BigInt(allowance) >= requiredAmount;

    console.log(`Prereq check for nonce ${permit.nonce}: Balance OK: ${ownerBalanceSufficient}, Allowance OK: ${permit2AllowanceSufficient}`);
    return { ownerBalanceSufficient, permit2AllowanceSufficient };

  } catch (error) {
    console.error(`Failed prerequisite check for nonce ${permit.nonce}:`, error);
    return { checkError: error instanceof Error ? error.message : "Failed to check balance/allowance." };
  }
}

/**
 * Formats a WEI amount string into a human-readable string with 2 decimal places.
 */
export const formatAmount = (weiAmount: string): string => {
  try {
    // Use 18 as the default decimal place, adjust if tokens with different decimals are expected
    const amount = Number(BigInt(weiAmount)) / 10 ** 18;
    return amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  } catch (error) {
    console.warn("Amount formatting failed:", error);
    return '0.00'; // Return a default value on error
  }
};

/**
 * Checks if a permit object contains all the essential fields required for claiming or testing.
 * Logs warnings if fields are missing.
 */
export const hasRequiredFields = (permit: PermitData): boolean => {
  const logPrefix = `Permit ${permit.nonce}:`;
  let isValid = true;
  const errors: string[] = [];

  // Common fields
  if (!permit.nonce) errors.push("nonce");
  if (!permit.networkId) errors.push("networkId");
  if (!permit.deadline) errors.push("deadline");
  if (!permit.beneficiary) errors.push("beneficiary");
  if (!permit.owner) errors.push("owner");
  if (!permit.signature) errors.push("signature");

  // Type-specific fields
  if (permit.type === 'erc20-permit') {
    if (!permit.amount) errors.push("amount (for ERC20)");
    if (!permit.token?.address) errors.push("token.address (for ERC20)");
  } else if (permit.type === 'erc721-permit') {
    // ERC721 might use tokenAddress or token.address
    if (!permit.tokenAddress && !permit.token?.address) errors.push("token address (for ERC721)");
    if (permit.token_id === undefined || permit.token_id === null) errors.push("token_id (for ERC721)");
  } else {
    // Handle unknown or potentially missing types
    errors.push(`unknown or missing type (${permit.type})`);
  }

  if (errors.length > 0) {
    console.warn(logPrefix, `Missing required fields: ${errors.join(', ')}`);
    console.warn(logPrefix, "Full Permit data:", permit); // Log full data for debugging
    isValid = false;
  }

  return isValid;
};
