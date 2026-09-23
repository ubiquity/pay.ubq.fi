import { describe, expect, test } from "bun:test";
import { deriveNonceBitmap, getFundingWalletActionLabels, groupPermitsForInvalidation } from "../src/utils/permit-invalidation-utils.ts";

describe("deriveNonceBitmap", () => {
  test("derives Permit2 unordered nonce word positions and bit masks", () => {
    expect(deriveNonceBitmap(0n)).toEqual({ wordPos: 0n, bitPos: 0n, bitMask: 1n });
    expect(deriveNonceBitmap(255n)).toEqual({ wordPos: 0n, bitPos: 255n, bitMask: 1n << 255n });
    expect(deriveNonceBitmap(256n)).toEqual({ wordPos: 1n, bitPos: 0n, bitMask: 1n });
    expect(deriveNonceBitmap(257n)).toEqual({ wordPos: 1n, bitPos: 1n, bitMask: 2n });
    expect(deriveNonceBitmap(511n)).toEqual({ wordPos: 1n, bitPos: 255n, bitMask: 1n << 255n });
    expect(deriveNonceBitmap(512n)).toEqual({ wordPos: 2n, bitPos: 0n, bitMask: 1n });
  });

  test("accepts number and string nonces", () => {
    expect(deriveNonceBitmap(256)).toEqual(deriveNonceBitmap(256n));
    expect(deriveNonceBitmap("256")).toEqual(deriveNonceBitmap(256n));
  });
});

describe("groupPermitsForInvalidation", () => {
  test("merges same-address same-word permits into one bitmap and separates other words and addresses", () => {
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

  test("keeps different words and different Permit2 addresses in separate groups", () => {
    const groups = groupPermitsForInvalidation([
      { signature: "sig-a", nonce: 0n, permit2Address: "0x1111111111111111111111111111111111111111" },
      { signature: "sig-b", nonce: 256n, permit2Address: "0x1111111111111111111111111111111111111111" },
      { signature: "sig-c", nonce: 0n, permit2Address: "0x2222222222222222222222222222222222222222" },
    ]);

    expect(groups.map((group) => [group.permit2Address, group.wordPos, group.mask, group.signatures])).toEqual([
      ["0x1111111111111111111111111111111111111111", 0n, 1n, ["sig-a"]],
      ["0x1111111111111111111111111111111111111111", 1n, 1n, ["sig-b"]],
      ["0x2222222222222222222222222222222222222222", 0n, 1n, ["sig-c"]],
    ]);
  });

  test("returns no groups when there are no permits", () => {
    expect(groupPermitsForInvalidation([])).toEqual([]);
  });
});

describe("getFundingWalletActionLabels", () => {
  test("uses delete wording and plural count while idle", () => {
    expect(getFundingWalletActionLabels(false, 3)).toEqual({
      primaryText: "Delete all",
      countText: "(3 Permits)",
      buttonText: "Delete",
      pendingText: "Deleting...",
      title: "Delete bogus permits by invalidating their Permit2 nonces on-chain",
    });
  });

  test("uses pending delete wording and singular count", () => {
    expect(getFundingWalletActionLabels(true, 1)).toEqual({
      primaryText: "Deleting...",
      countText: "(1 Permit)",
      buttonText: "Deleting...",
      pendingText: "Deleting...",
      title: "Delete bogus permits by invalidating their Permit2 nonces on-chain",
    });
  });

  test("counts zero permits as plural", () => {
    expect(getFundingWalletActionLabels(false, 0).countText).toBe("(0 Permits)");
  });
});
