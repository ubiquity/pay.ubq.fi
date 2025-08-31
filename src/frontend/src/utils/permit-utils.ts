import { formatUnits } from "viem";
import type { PermitData } from "../types";


/**
 * Formats a raw token amount (string or bigint) into a human-readable string.
 * Uses viem's formatUnits for accuracy.
 *
 * @param rawAmount The raw amount in the token's smallest unit (e.g., wei).
 * @param decimals The number of decimals the token uses.
 * @param displayDecimals The number of decimal places to show in the output string (default: 2).
 * @returns A formatted string representation of the amount.
 */
export const formatAmount = (rawAmount: string | bigint | undefined | null, decimals: number, displayDecimals = 2): string => {
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


