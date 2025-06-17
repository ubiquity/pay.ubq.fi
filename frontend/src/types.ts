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

// Keep PermitData as it seems to be used
export interface PermitData {
  nonce: string;
  amount?: string;
  token_id?: number | null;
  networkId: number;
  beneficiary: string;
  deadline: string;
  signature: string;
  type: "erc20-permit" | "erc721-permit";
  owner: string; // Funder
  tokenAddress?: string;
  githubCommentUrl: string;
  token?: TokenInfoInternal; // Use internal type
  partner?: PartnerInfoInternal; // Use internal type
  permit2Address: `0x${string}`;

  // Frontend-specific statuses for validation/testing
  status?: "Valid" | "Claimed" | "Expired" | "Invalid" | "Fetching" | "Testing";
  testError?: string; // For storing error messages during claim testing

  // Frontend-specific statuses for actual claiming
  claimStatus?: "Idle" | "Pending" | "Success" | "Error";
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
