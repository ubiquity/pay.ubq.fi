import { erc20Abi, formatUnits, type Abi, type Address } from "viem"; // Import formatUnits
import type { PermitData } from "../types";

// Removed unused MulticallContractInternal interface

// Define a simpler type for the return value
type ContractCallConfig = {
  address: Address;
  abi: Abi;
  functionName: string;
  args?: unknown[];
};

/**
 * Prepares the contract call objects for checking ERC20 permit prerequisites (balance and allowance).
 * Returns an array of contract call objects or null if not applicable.
 */
export function preparePermitPrerequisiteContracts(permit: PermitData): ContractCallConfig[] | null { // Updated return type
  if (permit.type !== "erc20-permit" || !permit.token?.address || !permit.amount || !permit.owner) {
    return null;
  }

  const ownerAddress = permit.owner as `0x${string}`;
  const tokenAddress = permit.token.address as `0x${string}`;

  const balanceCall: ContractCallConfig = { // Use updated type
    abi: erc20Abi,
    address: tokenAddress,
    functionName: "balanceOf",
    args: [ownerAddress],
  };

  const allowanceCall: ContractCallConfig = { // Use updated type
    abi: erc20Abi,
    address: tokenAddress,
    functionName: "allowance",
    args: [ownerAddress, permit.permit2Address],
  };

  return [balanceCall, allowanceCall];
}

/**
 * Formats a raw token amount (string or bigint) into a human-readable string.
 * Uses viem's formatUnits for accuracy.
 *
 * @param rawAmount The raw amount in the token's smallest unit (e.g., wei).
 * @param decimals The number of decimals the token uses.
 * @param displayDecimals The number of decimal places to show in the output string (default: 2).
 * @returns A formatted string representation of the amount.
 */
export const formatAmount = (
  rawAmount: string | bigint | undefined | null,
  decimals: number,
  displayDecimals = 2
): string => {
  if (rawAmount === undefined || rawAmount === null) {
    return Number(0).toFixed(displayDecimals); // Return "0.00" if amount is missing
  }
  try {
    const amountBigInt = BigInt(rawAmount);
    const formatted = formatUnits(amountBigInt, decimals);
    // Use Number() to parse the formatted string and then toLocaleString for formatting
    // This handles potential large/small numbers better than direct formatting of the string
    const numericValue = Number(formatted);
    if (isNaN(numericValue)) {
      console.warn(`formatAmount: formatted value "${formatted}" resulted in NaN.`);
      return Number(0).toFixed(displayDecimals);
    }
    // Use toLocaleString with maximumSignificantDigits for better formatting.
    return numericValue.toLocaleString(undefined, {
      maximumSignificantDigits: 2,
    });
  } catch (error) {
    console.warn(`Amount formatting failed for amount: ${rawAmount}, decimals: ${decimals}`, error);
    // Fallback to fixed decimals on error, as significant digits might not make sense for 0
    return Number(0).toFixed(displayDecimals);
  }
};

// Debug configuration - set from environment variable
const DEBUG_VALIDATION = typeof import.meta.env !== "undefined" && import.meta.env.VITE_DEBUG_VALIDATION === "true";

/**
 * Checks if a permit object contains all the essential fields required for claiming or testing.
 * Only logs warnings in debug mode.
 */
export const hasRequiredFields = (permit: PermitData): boolean => {
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
  if (permit.type === "erc20-permit") {
    if (!permit.amount) errors.push("amount");
    if (!permit.token?.address) errors.push("token.address");
  } else if (permit.type === "erc721-permit") {
    // ERC721 might use tokenAddress or token.address
    if (!permit.tokenAddress && !permit.token?.address) errors.push("token address");
    if (permit.token_id === undefined || permit.token_id === null) errors.push("token_id");
  } else {
    // Handle unknown or potentially missing types
    errors.push(`unknown type (${permit.type})`);
  }

  if (errors.length > 0) {
    isValid = false;
    
    // Only log in debug mode
    if (DEBUG_VALIDATION) {
      console.debug(`[Validation] Permit ${permit.nonce}: Missing ${errors.join(", ")}`);
    }
  }

  return isValid;
};

/**
 * Batch validation function for efficiency
 */
export const validatePermitBatch = (permits: PermitData[]): { 
  valid: PermitData[], 
  invalid: PermitData[],
  summary: { total: number, valid: number, invalid: number }
} => {
  const valid: PermitData[] = [];
  const invalid: PermitData[] = [];
  
  permits.forEach(permit => {
    if (hasRequiredFields(permit)) {
      valid.push(permit);
    } else {
      invalid.push(permit);
    }
  });
  
  const summary = {
    total: permits.length,
    valid: valid.length,
    invalid: invalid.length
  };
  
  // Single consolidated log instead of per-permit warnings
  if (invalid.length > 0 && !DEBUG_VALIDATION) {
    console.info(`Permit validation: ${valid.length} valid, ${invalid.length} invalid out of ${permits.length} total`);
  }
  
  return { valid, invalid, summary };
};

/**
 * Queues claim transactions for all claimable permits.
 * @param permits Array of PermitData objects.
 * @param writeContractAsync Function to send a contract write (must accept permit and options).
 * @returns Promise.allSettled result for all claim attempts.
 */
export async function queuePermitClaims(
  permits: PermitData[],
  writeContractAsync: (permit: PermitData, options: { mode: "recklesslyUnprepared" }) => Promise<unknown>
) {
  const claimable = permits.filter(
    (p) =>
      p.status === "Valid" &&
      p.claimStatus !== "Success" &&
      p.claimStatus !== "Pending"
  );
  const promises = claimable.map((permit) =>
    writeContractAsync(permit, { mode: "recklesslyUnprepared" })
  );
  return Promise.allSettled(promises);
}
