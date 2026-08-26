/**
 * UbiquityOS - permit2-signature-check
 */
export function isPermitValid(deadline: number, now: number = Date.now()): boolean { return deadline > Math.floor(now / 1000); }
