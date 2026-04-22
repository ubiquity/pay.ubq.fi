// Define TokenInfo locally within PermitData if needed, or adjust PermitData
interface TokenInfoInternal {
  address: string;
  network: number;
  decimals?: number;
}

interface PartnerInfoInternal {
  wallet?: {
    address: string;
  };
}

export interface AllowanceAndBalance {
  networkId: number;
  permit2Address: string;
  tokenAddress: string;
  owner: string;
  balance?: bigint;
  allowance?: bigint;
  maxClaimable?: bigint; // Maximum claimable amount based on allowance and balance
  error?: string;
}

// Keep PermitData as it seems to be used
import type { Tables } from "./database.types.ts";

// Re-export database helper types for convenience
export type { Tables, TablesInsert, TablesUpdate, Enums } from "./database.types.ts";

// Type-safe table name constants
export const TABLE_NAMES = {
  permits: "permits",
  tokens: "tokens",
  partners: "partners",
  wallets: "wallets",
  locations: "locations",
  users: "users",
} as const;

export type TableName = keyof typeof TABLE_NAMES;

// Type-safe permit status
export type PermitStatus = "Valid" | "Claimed" | "Expired" | "Invalid" | "Fetching" | "Testing";
export type ClaimStatus = "Idle" | "Pending" | "Success" | "Error";

export interface PermitData {
  nonce: string;
  amount: bigint;
  token_id?: number | null;
  networkId: number;
  beneficiary: string;
  beneficiaryUserId?: number; // GitHub user ID for username lookup
  deadline: string;
  signature: string;
  type: "erc20-permit" | "erc721-permit";
  owner: string; // Funder
  tokenAddress?: string;
  githubCommentUrl: string;
  token?: TokenInfoInternal; // Use internal type
  partner?: PartnerInfoInternal; // Use internal type
  permit2Address: `0x${string}`;

  // Database row reference timestamp
  created_at?: string;

  // Frontend-specific statuses for validation/testing
  status?: PermitStatus;
  testError?: string; // For storing error messages during claim testing

  // Frontend-specific statuses for actual claiming
  claimStatus?: ClaimStatus;
  claimError?: string;
  transactionHash?: string; // Store claim tx hash

  // Frontend-specific checks for prerequisites (balance/allowance)
  ownerBalanceSufficient?: boolean;
  permit2AllowanceSufficient?: boolean;
  checkError?: string; // Error during balance/allowance check
  isNonceUsed?: boolean; // Added for nonce check result

  // Estimated value (potentially added by backend)
  usdValue?: number;

  // --- Fields for CowSwap Quote Estimation ---
  estimatedAmountOut?: string; // Store as string (wei) to handle large numbers
  quoteError?: string | null; // Error message if quote fetching fails for this permit's group
}
