import { describe, expect, test } from "bun:test";
import { deriveNonceBitmap, getFundingWalletActionLabels, groupPermitsForInvalidation } from "../src/utils/permit-invalidation-utils";

describe("deriveNonceBitmap", () => {
  test("derives Permit2 unordered nonce word positions and bit masks", () => {
    expect(deriveNonceBitmap(0n)).toEqual({ wordPos: 0n, bitPos: 0n, bitMask: 1n });
    expect(deriveNonceBitmap(255n)).toEqual({ wordPos: 0n, bitPos: 255n, bitMask: 1n << 255n });
    expect(deriveNonceBitmap(256n)).toEqual({ wordPos: 1n, bitPos: 0n, bitMask: 1n });
  });
});

describe("groupPermitsForInvalidation", () => {
  test("groups same Permit2 address and nonce word into a single bitmap transaction", () => {
    const groups = groupPermitsForInvalidation([
      { signature: "sig-a", nonce: 1n, permit2Address: "0xABC" },
      { signature: "sig-b", nonce: 2n, permit2Address: "0xabc" },
      { signature: "sig-c", nonce: 256n, permit2Address: "0xABC" },
      { signature: "sig-d", nonce: 1n, permit2Address: "0xDEF" },
    ]);

    expect(groups).toEqual([
      {
        permit2Address: "0xABC",
        wordPos: 0n,
        mask: (1n << 1n) | (1n << 2n),
        signatures: ["sig-a", "sig-b"],
      },
      {
        permit2Address: "0xABC",
        wordPos: 1n,
        mask: 1n,
        signatures: ["sig-c"],
      },
      {
        permit2Address: "0xDEF",
        wordPos: 0n,
        mask: 1n << 1n,
        signatures: ["sig-d"],
      },
    ]);
  });
});

describe("getFundingWalletActionLabels", () => {
  test("uses delete wording while explaining the on-chain invalidation action", () => {
    expect(getFundingWalletActionLabels(false, 3)).toEqual({
      primaryText: "Delete all",
      countText: "(3 Permits)",
      buttonText: "Delete",
      pendingText: "Deleting...",
      title: "Delete bogus permits by invalidating their Permit2 nonces on-chain",
    });

    expect(getFundingWalletActionLabels(true, 1)).toMatchObject({
      primaryText: "Deleting...",
      countText: "(1 Permit)",
      buttonText: "Deleting...",
    });
  });
});
