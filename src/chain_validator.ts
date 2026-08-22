export const SUPPORTED_L2_CHAINS: Record<number, string> = {
  10: 'Optimism',
  42161: 'Arbitrum One',
  8453: 'Base',
  1: 'Ethereum Mainnet',
  100: 'Gnosis Chain'
};

export function isSupportedL2Chain(chainId: number): boolean {
  return Boolean(SUPPORTED_L2_CHAINS[chainId]);
}
