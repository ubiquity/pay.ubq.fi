/**
 * Ubiquity - EIP-1559 Priority Fee Dynamic Escalation
 */
export function calculateDynamicPriorityFeeBump(
  currentBaseFeeGwei: number,
  recommendedPriorityFeeGwei: number,
  congestionRatio: number // 0.0 to 1.0
): { maxFeePerGasGwei: number; maxPriorityFeePerGasGwei: number } {
  const bumpMultiplier = 1 + Math.min(0.5, Math.max(0.1, congestionRatio * 0.5));
  const bumpedPriorityFee = recommendedPriorityFeeGwei * bumpMultiplier;
  const maxFee = (currentBaseFeeGwei * 2) + bumpedPriorityFee;

  return {
    maxFeePerGasGwei: Number(maxFee.toFixed(3)),
    maxPriorityFeePerGasGwei: Number(bumpedPriorityFee.toFixed(3))
  };
}
