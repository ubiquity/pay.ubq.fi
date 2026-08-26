/**
 * UbiquityOS - address-checksum-validator
 */
export function isValidAddress(addr: string): boolean { return /^0x[a-fA-F0-9]{40}$/.test(addr); }
