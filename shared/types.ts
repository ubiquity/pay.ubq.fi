// Define shared types between frontend and backend here

// Example placeholder for a Permit type - needs refinement based on actual data
export interface PermitDetails {
  nonce: string;
  amount?: string;
  token_id?: number | null;
  networkId: number;
  beneficiary: string;
  deadline: string;
  signature: string;
}

export interface TokenInfo {
  address: string;
  network: number;
}

export interface PartnerInfo {
  wallet?: {
    address: string;
  };
}

export interface PermitData extends PermitDetails {
  type: 'erc20-permit' | 'erc721-permit';
  owner: string; // Funder
  tokenAddress?: string;
  githubCommentUrl: string;
  token?: TokenInfo;
  partner?: PartnerInfo;

  // Frontend-specific statuses for validation/testing
  status?: 'Valid' | 'Claimed' | 'Expired' | 'Invalid' | 'Fetching' | 'Testing' | 'TestFailed' | 'TestSuccess' | 'Ready';
  testError?: string; // For storing error messages during claim testing

  // Frontend-specific statuses for actual claiming
  claimStatus?: 'Idle' | 'Pending' | 'Success' | 'Error';
  claimError?: string;
  transactionHash?: string; // Store claim tx hash
}

// Add other shared types as needed (e.g., API response types)
