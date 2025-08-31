# Permit2 to Permit3 Migration - Handoff Document

## Overview

This document details the modifications made to the Permit2 to Permit3 nonce synchronization tool for the pay.ubq.fi project. The primary goal was to optimize the migration process to only handle permits stored in the Ubiquity database rather than attempting to process millions of mainnet permits.

## Script Location

`scripts/sync-permit2-to-permit3.ts`

## Problem Statement

The original synchronization script was attempting to scan and migrate ALL permits from the Permit2 contract on mainnet, which would involve processing millions of permits. This was inefficient and unnecessary since Ubiquity only needs to migrate permits stored in its own database.

## Implemented Solution

### Key Modifications

1. **Database-Only Migration**:
   - Modified the script to fetch permits exclusively from the Supabase database
   - Removed the event scanning functionality that was trying to process millions of mainnet permits
   - Now processes only permits associated with the Ubiquity payment system

2. **Removed Claim Status Filtering**:
   - Initially modified to only sync unclaimed permits (where `transaction` is null)
   - Later updated to sync ALL permits regardless of claim status
   - Rationale: If a permit is regenerated on GitHub after being claimed, the nonce is the only security measure, and this won't help if the smart contract changes

3. **Added Dry-Run Mode**:
   - Implemented `--dry-run` flag for safe testing
   - Allows verification of which permits would be synced without executing transactions
   - Usage: `bun scripts/sync-permit2-to-permit3.ts --dry-run`

4. **TypeScript Error Fixes**:
   - Fixed optional account address issue in report generation
   - Ensured proper type handling for database queries

## Technical Details

### Database Schema Understanding

The script queries the following tables:
- `permits`: Contains permit data including nonces, transactions, beneficiary/owner info
- `tokens`: Network information (chainId 1 for mainnet, 100 for Gnosis)
- `wallets`: Address information for permit owners
- `partners`: Fee and beneficiary address data

### Migration Logic

1. Fetches all permits from the database
2. Groups permits by owner address
3. Checks nonce status on:
   - Permit2 on Mainnet
   - Permit2 on Gnosis
   - Permit3 on Gnosis
4. Identifies permits that need syncing (used on Permit2 but not on Permit3)
5. Prepares batch transactions to invalidate nonces on Permit3
6. Generates detailed reports of the migration process

### Environment Requirements

Required environment variables:
- `SUPABASE_URL`: Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY`: Service role key for database access
- `MIGRATION_PRIVATE_KEY`: Private key for executing transactions (not needed for dry-run)
- `RPC_URL`: RPC endpoint (defaults to "https://rpc.ubq.fi")

## Current State

- The synchronization script is ready for production use
- Dry-run testing shows it correctly identifies database permits needing synchronization
- The script now focuses only on permits in the Ubiquity database, making it much more efficient
- All permits (claimed and unclaimed) are considered for migration

## Next Steps

1. **Testing**: Run the script in dry-run mode to verify the permits that need syncing
2. **Migration**: Execute the actual migration by running without the `--dry-run` flag
3. **Monitoring**: Check the generated JSON report files for migration results
4. **Verification**: Confirm that synced nonces are properly invalidated on Permit3

## Important Notes

- The script creates detailed JSON reports with timestamps for audit purposes
- Failed transactions are logged and can be retried
- The migration account address is logged for transparency
- There's a 1-second delay between batches to avoid rate limiting

## Related Documentation

- `scripts/PERMIT2_TO_PERMIT3_SYNC.md`: Contains additional technical details about the sync process
- `scripts/NONCE_MIGRATION.md`: General information about nonce migration strategies

## Testing Instructions

1. Set up environment variables in `.env`:
   ```
   SUPABASE_URL=your_supabase_url
   SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
   MIGRATION_PRIVATE_KEY=0x... (only for actual migration)
   ```

2. Run dry-run to see what would be migrated:
   ```bash
   bun scripts/sync-permit2-to-permit3.ts --dry-run
   ```

3. Review the output and generated JSON report

4. Execute actual migration (requires MIGRATION_PRIVATE_KEY):
   ```bash
   bun scripts/sync-permit2-to-permit3.ts
   ```

## Key Code Changes Summary

The main changes were in the `fetchPermitsFromDatabase` function:
- Removed the `.is("transaction", null)` filter
- Changed console message from "Fetching unclaimed permits" to "Fetching all permits"
- Removed the logic that skipped claimed permits
- Updated logging to show total permits instead of distinguishing claimed/unclaimed

This ensures that ALL permits in the database are considered for migration, regardless of their claim status.
