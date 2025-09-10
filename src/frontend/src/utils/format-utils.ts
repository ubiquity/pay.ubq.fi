// format-utils.ts: Formatting utilities for GitHub URLs and other data

// Extract GitHub username from various GitHub URL formats
export function extractGitHubUsername(githubUrl: string): string | null {
  if (!githubUrl || typeof githubUrl !== 'string') {
    return null;
  }

  // Handle different GitHub URL formats
  const patterns = [
    // https://github.com/username
    /^https?:\/\/github\.com\/([^/]+)\/?$/,
    // https://github.com/username/repo
    /^https?:\/\/github\.com\/([^/]+)\/[^/]+/,
    // https://github.com/username/repo/issues/123
    /^https?:\/\/github\.com\/([^/]+)\/[^/]+\/issues\//,
    // https://github.com/username/repo/pull/123
    /^https?:\/\/github\.com\/([^/]+)\/[^/]+\/pull\//,
    // https://api.github.com/repos/username/repo
    /^https?:\/\/api\.github\.com\/repos\/([^/]+)\//,
  ];

  for (const pattern of patterns) {
    const match = githubUrl.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }

  return null;
}

// Format address to show shortened version
export function formatAddress(address: string, chars = 6): string {
  if (!address) return '';
  if (address.length <= chars * 2 + 2) return address;
  
  return `${address.slice(0, chars + 2)}...${address.slice(-chars)}`;
}

// Format amount with proper decimal places
export function formatAmount(amount: bigint | string | number, decimals = 18): string {
  const amountBig = typeof amount === 'bigint' ? amount : BigInt(amount);
  const divisor = BigInt(10 ** decimals);
  const formatted = Number(amountBig) / Number(divisor);
  
  return formatted.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 4,
  });
}