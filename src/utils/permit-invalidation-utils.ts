export type InvalidationPermitInput = {
  signature: string;
  nonce: bigint | number | string;
  permit2Address: `0x${string}`;
};

export type NonceBitmap = {
  wordPos: bigint;
  bitPos: bigint;
  bitMask: bigint;
};

export type InvalidationGroup = {
  permit2Address: `0x${string}`;
  wordPos: bigint;
  mask: bigint;
  signatures: string[];
};

export type FundingWalletActionLabels = {
  primaryText: string;
  countText: string;
  buttonText: string;
  pendingText: string;
  title: string;
};

/**
 * Derives the Permit2 unordered-nonce word position and the bit within that word.
 */
export function deriveNonceBitmap(nonce: bigint | number | string): NonceBitmap {
  const nonceBigInt = BigInt(nonce);
  const wordPos = nonceBigInt >> 8n;
  const bitPos = nonceBigInt & 0xffn;
  return { wordPos, bitPos, bitMask: 1n << bitPos };
}

/**
 * Groups permits by Permit2 address and nonce word so a single invalidation call
 * can mask every nonce bit that belongs to that word.
 */
export function groupPermitsForInvalidation(permits: readonly InvalidationPermitInput[]): InvalidationGroup[] {
  const grouped = new Map<string, InvalidationGroup>();

  for (const permit of permits) {
    const { wordPos, bitMask } = deriveNonceBitmap(permit.nonce);
    const groupKey = `${permit.permit2Address.toLowerCase()}:${wordPos.toString()}`;
    const existing = grouped.get(groupKey) ?? { permit2Address: permit.permit2Address, wordPos, mask: 0n, signatures: [] };

    existing.mask |= bitMask;
    existing.signatures.push(permit.signature);
    grouped.set(groupKey, existing);
  }

  return Array.from(grouped.values());
}

/**
 * Copy for the funding-wallet delete action, which invalidates Permit2 nonces on-chain.
 */
export function getFundingWalletActionLabels(isPending: boolean, permitCount: number): FundingWalletActionLabels {
  const countText = `(${permitCount} Permit${permitCount === 1 ? "" : "s"})`;
  const pendingText = "Deleting...";

  return {
    primaryText: isPending ? pendingText : "Delete all",
    countText,
    buttonText: isPending ? pendingText : "Delete",
    pendingText,
    title: "Delete pending owned permits by invalidating their Permit2 nonces on-chain",
  };
}
