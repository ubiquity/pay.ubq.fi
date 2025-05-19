import { erc20Abi, type Abi, type Address, formatUnits } from "viem"; // Import formatUnits
import type { PermitData } from "../types";

// Removed unused MulticallContractInternal interface

// Define a simpler type for the return value
type ContractCallConfig = {
  address: Address;
  abi: Abi;
  functionName: string;
  args?: unknown[];
};

const PERMIT2_ADDRESS = "0x000000000022D473030F116dDEE9F6B43aC78BA3"; // Universal Permit2 address

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
    args: [ownerAddress, PERMIT2_ADDRESS],
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
    console.warn(logPrefix, `Missing required fields: ${errors.join(", ")}`);
    console.warn(logPrefix, "Full Permit data:", permit); // Log full data for debugging
    isValid = false;
  }

  return isValid;
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
