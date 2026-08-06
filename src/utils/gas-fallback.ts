/**
 * Gas Estimation Fallback Helper for Ubiquity Payment Widget (#433 Fix)
 */

export function estimateGasWithFallback(estimatedGas: bigint | null, defaultGasBuffer: bigint = 50000n): bigint {
  if (!estimatedGas || estimatedGas <= 0n) {
    return defaultGasBuffer; // Safe fallback gas limit
  }
  return estimatedGas + (estimatedGas / 10n); // 10% safety margin
}
