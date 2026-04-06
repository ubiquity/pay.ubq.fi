# Permit Backfill Checklist

## Snapshot (2025-12-26)
- Missing `partner_id` + unclaimed permits: 0
- Backfilled via signature recovery:
  - 27 earlier batch (partner_id + token_id + network_id + permit2_address)
  - 85 additional rows executed (29 WXDAI token_id 1, 56 UUSD token_id 2)
- Cleanup and heuristics:
  - Deleted zero-value and 1-wei permits.
  - Deleted 8 invalid signature rows (regen complete).
  - Defaulted partner_id by org for 43 of 45 partnerNotFound rows.
- Remaining buckets:
  - PartnerNotFound: 0

## Goals
- Ensure every unclaimed permit has a valid `partner_id`, `token_id`, `network_id`, and `permit2_address`.
- Reduce noisy "no owner address" warnings in the UI by fixing legacy rows.
- Avoid creating new partners unless explicitly approved.

## Checklist
- [x] Execute signature-based inference updates for the 85 candidate rows.
- [x] Generate a list of recovered owner addresses for the 45 `partnerNotFound` permits.
- [x] Decide whether invalid signature/nonce rows should be deleted or left as-is.
- [x] Delete retained invalid signature rows (regen pending).
- [x] Default partner_id by org for partnerNotFound rows.
- [x] Resolve remaining 2 `partnerNotFound` permits (missing org / org without defaults).
- [ ] Update `scripts/permit2-backfill-partners.ts` to accept owner/partner overrides if needed.
- [ ] Run `scripts/permit-checker.ts --audit` for at least one wallet to confirm warnings drop.
- [ ] Optional: run `scripts/permit2-audit.ts` to validate on-chain nonce usage for remaining permits.

## Inputs Needed
- Token timeline confirmation:
  - DAI mainnet (token_id 4, chain 1) -> WXDAI (token_id 1, chain 100) -> UUSD (token_id 2, chain 100)
- Repo/date cutoffs for token changes (if a single repo used multiple tokens over time).
- Owner wallet -> partner_id mapping for recovered owners without partner match.
- Policy for invalid rows (delete vs. ignore).

## Scripts
- Backfill partners: `scripts/permit2-backfill-partners.ts`
- Backfill partners by org: `scripts/permit2-backfill-partners-by-org.ts`
- Delete retained invalids: `scripts/permit2-delete-retained-invalids.ts`
- Permit checker (audit): `scripts/permit-checker.ts --audit`
- On-chain audit: `scripts/permit2-audit.ts`
