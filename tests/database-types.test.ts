import { describe, expect, test } from "bun:test";
import type { CompositeTypes, Database, Enums, Tables, TablesInsert, TablesUpdate } from "../src/database.types.ts";
import { mapDbPermitToPermitDataWithIssues, type PermitRow } from "../src/workers/permit-checker.logic.ts";

describe("Database helper types and permit row mapping (#433)", () => {
  test("maps a typed Tables<'permits'> row with joined relations into PermitData", async () => {
    const permitRow: PermitRow = {
      id: 42,
      amount: "100000000000000000000",
      nonce: "12345",
      deadline: "1999999999",
      signature: "0x" + "11".repeat(65),
      transaction: null,
      invalidation: null,
      created: "2026-10-23T00:00:00Z",
      updated: null,
      beneficiary_id: 7,
      location_id: 10,
      partner_id: 3,
      token_id: 1,
      token: {
        id: 1,
        address: "0xc6ed4f520f6a4e4dc27273509239b7f8a68d2068",
        network: 100,
        created: "2026-10-23T00:00:00Z",
        updated: null,
      },
      partner: {
        id: 3,
        wallet_id: 9,
        location_id: 10,
        created: "2026-10-23T00:00:00Z",
        updated: null,
        wallet: {
          id: 9,
          address: "0x1111111111111111111111111111111111111111",
          created: "2026-10-23T00:00:00Z",
          updated: null,
        },
      },
      location: {
        id: 10,
        node_id: "I_kwDO123",
        node_type: "Issue" satisfies Enums<"Label">,
        node_url: "https://github.com/ubiquity/pay.ubq.fi/issues/433",
        comment_id: null,
        issue_id: 433,
        repository_id: 1,
        organization_id: 1,
        user_id: 7,
        created: "2026-10-23T00:00:00Z",
        updated: null,
      },
    };

    const insertPayload: TablesInsert<"permits"> = {
      amount: permitRow.amount,
      beneficiary_id: permitRow.beneficiary_id,
      deadline: permitRow.deadline,
      nonce: permitRow.nonce,
      signature: permitRow.signature,
    };
    const updatePayload: TablesUpdate<"permits"> = {
      transaction: "0x" + "aa".repeat(32),
    };
    const dbCheck: keyof Database["public"]["Tables"] = "permits";
    const compositeCheck: CompositeTypes<never> | null = null;

    const mapped = await mapDbPermitToPermitDataWithIssues({
      permit: permitRow,
      lowerCaseWalletAddress: "0x2222222222222222222222222222222222222222",
    });
    expect(mapped.issues).toEqual(["signature_recovery_failed"]);
    expect(insertPayload.beneficiary_id).toBe(7);
    expect(updatePayload.transaction).toHaveLength(66);
    expect(dbCheck).toBe("permits");
    expect(compositeCheck).toBeNull();
    expect((permitRow as Tables<"permits">).id).toBe(42);
  });
});
