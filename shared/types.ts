// Define shared types between frontend and backend here

// Example placeholder for a Permit type - needs refinement based on actual data
export interface PermitData {
  nonce: string;
  networkId: number;
  type: 'erc20-permit' | 'erc721-permit';
  owner: string; // Funder
  beneficiary: string; // Recipient
  tokenAddress: string;
  amount?: string; // For ERC20
  deadline: string;
  signature: string;
  githubCommentUrl: string;
  // Add ERC721 specific fields if needed (e.g., from permit.request)
  erc721Request?: any; // TODO: Define more specific type

  // Frontend-specific status?
  status?: 'Valid' | 'Claimed' | 'Expired' | 'Invalid' | 'Fetching';
  transactionHash?: string;
}

// Add other shared types as needed (e.g., API response types)
