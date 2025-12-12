/**
 * Utility functions for formatting and parsing data.
 */

// Regex to parse GitHub URLs (issues and PRs)
const GITHUB_URL_REGEX = /https:\/\/github\.com\/([^/]+)\/([^/]+)\/(?:issues|pull)\/(\d+)/;

/**
 * Parse GitHub URL to extract organization, repository, and issue/PR number.
 */
export function parseGitHubUrl(url: string): { org: string; repo: string; number: string } | null {
  const match = url.match(GITHUB_URL_REGEX);
  if (!match) return null;
  return {
    org: match[1],
    repo: match[2],
    number: match[3],
  };
}

/**
 * Truncate Ethereum address for display.
 */
export function truncateAddress(address: string, startChars = 6, endChars = 4): string {
  if (!address) return "";
  if (address.length <= startChars + endChars) return address;
  return `${address.slice(0, startChars)}...${address.slice(-endChars)}`;
}

