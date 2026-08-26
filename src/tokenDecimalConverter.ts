/**
 * UbiquityOS - token-decimal-converter
 */
export function formatUnits(amount: bigint, decimals: number): string { return (Number(amount) / 10**decimals).toFixed(2); }
