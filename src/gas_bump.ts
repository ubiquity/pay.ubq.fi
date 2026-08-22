export function calculateSpeedupGasPrice(currentMaxFeePerGas: bigint, bumpPercentage: number = 15): bigint {
  const multiplier = 100n + BigInt(bumpPercentage);
  return (currentMaxFeePerGas * multiplier) / 100n;
}
