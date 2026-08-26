/**
 * UbiquityOS - chain-reorg-detector
 */
export function getRequiredConfirmations(valueUsd: number): number { return valueUsd > 1000 ? 12 : 3; }
