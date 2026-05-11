type InvalidationPermitInput = Readonly<{
  signature: string;
  nonce: bigint | number | string;
  permit2Address: `0x${string}` | string;
}>;

export type NonceBitmap = Readonly<{
  wordPos: bigint;
  bitPos: bigint;
  bitMask: bigint;
}>;

export type InvalidationGroup = Readonly<{
  permit2Address: `0x${string}` | string;
  wordPos: bigint;
  mask: bigint;
  signatures: string[];
}>;

export type FundingWalletActionLabels = Readonly<{
  primaryText: string;
  countText: string;
  buttonText: string;
  pendingText: string;
  title: string;
}>;

export function deriveNonceBitmap(nonce: bigint | number | string): NonceBitmap {
  const nonceBigInt = BigInt(nonce);
  const wordPos = nonceBigInt >> 8n;
  const bitPos = nonceBigInt & 0xffn;
  return { wordPos, bitPos, bitMask: 1n << bitPos };
}

export function groupPermitsForInvalidation(permits: readonly InvalidationPermitInput[]): InvalidationGroup[] {
  const grouped = new Map<string, { permit2Address: `0x${string}` | string; wordPos: bigint; mask: bigint; signatures: string[] }>();

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

export function getFundingWalletActionLabels(isPending: boolean, permitCount: number): FundingWalletActionLabels {
  const countText = `(${permitCount} Permit${permitCount === 1 ? "" : "s"})`;
  const pendingText = "Deleting...";

  return {
    primaryText: isPending ? pendingText : "Delete all",
    countText,
    buttonText: isPending ? pendingText : "Delete",
    pendingText,
    title: "Delete bogus permits by invalidating their Permit2 nonces on-chain",
  };
}
