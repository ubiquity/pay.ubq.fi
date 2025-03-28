// Removed readContract import, will use multicall
import { erc20Abi, type Abi, type Address } from 'viem'; // Import Address and Abi types
import type { PermitData } from '../../../shared/types';
// Removed config import, chainId will be passed

// Define and export a type for the contract call object used by multicall
export interface MulticallContract { // Added export
  address: Address;
  abi: Abi;
  functionName: string;
  args?: unknown[];
}

const PERMIT2_ADDRESS = '0x000000000022D473030F116dDEE9F6B43aC78BA3'; // Universal Permit2 address

/**
 * Prepares the contract call objects for checking ERC20 permit prerequisites (balance and allowance).
 * Returns an array of contract call objects or null if not applicable.
 */
export function preparePermitPrerequisiteContracts(permit: PermitData): MulticallContract[] | null { // Use specific type
  if (permit.type !== 'erc20-permit' || !permit.token?.address || !permit.amount || !permit.owner) {
    // Not applicable for non-ERC20 or missing data
    return null;
  }

  const ownerAddress = permit.owner as `0x${string}`;
  const tokenAddress = permit.token.address as `0x${string}`;

  const balanceCall = {
    abi: erc20Abi,
    address: tokenAddress,
    functionName: 'balanceOf',
    args: [ownerAddress],
  };

  const allowanceCall = {
    abi: erc20Abi,
    address: tokenAddress,
    functionName: 'allowance',
    args: [ownerAddress, PERMIT2_ADDRESS],
  };

  return [balanceCall, allowanceCall];
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
