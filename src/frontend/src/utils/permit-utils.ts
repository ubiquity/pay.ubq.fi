import { formatUnits } from "viem";
import type { PermitData } from "../types";
import { logger } from "./logger.ts";

// Removed unused interfaces and types


/**
 * Enhanced number formatting utility for better decimal precision display.
 * Prevents visual rounding issues while maintaining readability.
 */
export const formatDisplayAmount = (
  numericValue: number,
  options: {
    maximumFractionDigits?: number;
    minimumFractionDigits?: number;
    useSignificantDigits?: boolean;
    significantDigits?: number;
  } = {}
): string => {
  const {
    maximumFractionDigits = 6,
    minimumFractionDigits = 0,
    useSignificantDigits = false,
    significantDigits = 4
  } = options;
  
  if (isNaN(numericValue)) {
    return "0.00";
  }
  
  // Handle very small amounts (less than 0.000001) by showing scientific notation
  if (numericValue > 0 && numericValue < 0.000001) {
    return numericValue.toExponential(2);
  }
  
  // For amounts less than 1, show more decimal places to avoid rounding to 0
  if (numericValue > 0 && numericValue < 1) {
    const adjustedMaxFractionDigits = Math.max(maximumFractionDigits, 4);
    return numericValue.toLocaleString(undefined, {
      minimumFractionDigits,
      maximumFractionDigits: adjustedMaxFractionDigits,
    });
  }
  
  // Use significant digits for consistency when requested
  if (useSignificantDigits) {
    return numericValue.toLocaleString(undefined, {
      maximumSignificantDigits: significantDigits,
      minimumSignificantDigits: Math.min(significantDigits, 2)
    });
  }
  
  // Default formatting with proper decimal handling
  return numericValue.toLocaleString(undefined, {
    minimumFractionDigits,
    maximumFractionDigits,
  });
};

/**
 * Formats a raw token amount (string or bigint) into a human-readable string.
 * Uses viem's formatUnits for accuracy and prevents visual rounding issues.
 *
 * @param rawAmount The raw amount in the token's smallest unit (e.g., wei).
 * @param decimals The number of decimals the token uses.
 * @param options Formatting options
 * @returns A formatted string representation of the amount.
 */
export const formatAmount = (
  rawAmount: string | bigint | undefined | null,
  decimals: number,
  options: {
    maximumFractionDigits?: number;
    minimumFractionDigits?: number;
    useSignificantDigits?: boolean;
    significantDigits?: number;
  } = {}
): string => {
  if (rawAmount === undefined || rawAmount === null) {
    return "0.00";
  }
  
  try {
    const amountBigInt = BigInt(rawAmount);
    const formatted = formatUnits(amountBigInt, decimals);
    const numericValue = Number(formatted);
    
    if (isNaN(numericValue)) {
      logger.warn(`formatAmount: formatted value "${formatted}" resulted in NaN.`);
      return "0.00";
    }
    
    return formatDisplayAmount(numericValue, options);
  } catch (error) {
    logger.warn(`Amount formatting failed for amount: ${rawAmount}, decimals: ${decimals}`, error);
    return "0.00";
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
  if (permit.type === "erc20-permit") {
    if (!permit.amount) errors.push("amount (for ERC20)");
    if (!permit.token?.address) errors.push("token.address (for ERC20)");
  } else if (permit.type === "erc721-permit") {
    // ERC721 might use tokenAddress or token.address
    if (!permit.tokenAddress && !permit.token?.address) errors.push("token address (for ERC721)");
    if (permit.token_id === undefined || permit.token_id === null) errors.push("token_id (for ERC721)");
  } else {
    // Handle unknown or potentially missing types
    errors.push(`unknown or missing type (${permit.type})`);
  }

  if (errors.length > 0) {
    logger.warn(logPrefix, `Missing required fields: ${errors.join(", ")}`);
    logger.debug(logPrefix, "Full Permit data:", permit); // Log full data for debugging
    isValid = false;
  }

  return isValid;
};

