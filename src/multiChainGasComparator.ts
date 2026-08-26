/**
 * Ubiquity - Multi-Chain Gas Cost Comparator
 */
export interface ChainGasEstimate {
  chainId: number;
  networkName: string;
  estimatedCostUsd: number;
}

export function selectOptimalPayoutChain(estimates: ChainGasEstimate[]): ChainGasEstimate | null {
  if (estimates.length === 0) return null;
  return [...estimates].sort((a, b) => a.estimatedCostUsd - b.estimatedCostUsd)[0];
}
