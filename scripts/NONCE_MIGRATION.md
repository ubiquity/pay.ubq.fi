# Nonce Migration Guide

## Overview

This guide explains how to run the nonce migration script to prevent double-spending of permits after a smart contract upgrade that reset nonces.

## Problem

When the Permit3 contract was upgraded, it created a fresh set of nonces, potentially allowing permits that were already claimed to be claimed again. This migration script solves this by:

1. Fetching all claimed permits from the database
2. Checking which nonces need to be invalidated on-chain
3. Batch invalidating those nonces on the respective networks

## Prerequisites

1. **Environment Variables**
   ```bash
   SUPABASE_URL=your_supabase_project_url
   SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
   MIGRATION_PRIVATE_KEY=0x... # Private key of the wallet that will pay for gas
   ```

2. **Requirements**
   - The migration wallet must have sufficient native tokens (ETH, OP, xDAI) on each network to pay for gas
   - The migration wallet should ideally be a multisig or controlled by the protocol administrators

## Running the Migration

1. **Install dependencies**
   ```bash
   cd /path/to/pay.ubq.fi
   bun install
   ```

2. **Set environment variables**
   ```bash
   export SUPABASE_URL="https://your-project.supabase.co"
   export SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"
   export MIGRATION_PRIVATE_KEY="0x..." # Your private key
   ```

3. **Run the migration script**
   ```bash
   bun run scripts/migrate-invalidate-nonces.ts
   ```

## What the Script Does

1. **Fetches Claimed Permits**: Queries the database for all permits with a transaction hash (claimed permits)

2. **Groups by Network and Owner**: Organizes permits by network ID and owner address for efficient batch processing

3. **Checks Nonce Status**: For each nonce, checks if it's already invalidated on-chain

4. **Batch Invalidation**: Uses bitmap invalidation to efficiently invalidate multiple nonces in a single transaction

5. **Generates Report**: Creates a JSON report with:
   - Successfully invalidated nonces and transaction hashes
   - Failed invalidations that need manual review
   - Timestamp and summary statistics

## Output

The script generates a migration report file:
```
migration-report-{timestamp}.json
```

This report contains:
- Total claimed permits processed
- Successful invalidations with transaction hashes
- Failed invalidations that may need manual intervention
- Network-specific summaries

## Networks Supported

- **Mainnet** (1): Uses https://eth.llamarpc.com
- **Optimism** (10): Uses https://optimism.llamarpc.com  
- **Gnosis** (100): Uses https://rpc.gnosischain.com

## Cross-Network Protection

In addition to the migration, the frontend has been updated with cross-network protection:

1. **Database Check**: The app now queries claimed permits from the database on load
2. **Frontend Filtering**: Permits that were claimed on ANY network are hidden from the UI
3. **Real-time Updates**: After each claim, the claimed permits list is refreshed

## Monitoring

After running the migration:

1. Check the migration report for any failed invalidations
2. Verify on-chain that nonces were invalidated using a block explorer
3. Monitor the frontend to ensure claimed permits are properly hidden
4. Check application logs for any permission-related errors

## Troubleshooting

### Common Issues

1. **Insufficient Gas**: Ensure the migration wallet has enough native tokens on each network
2. **RPC Errors**: The script uses public RPCs which may have rate limits. Consider using private RPC endpoints for production
3. **Permission Errors**: Ensure the SUPABASE_SERVICE_ROLE_KEY has proper permissions to read from the permits table

### Manual Verification

To manually verify a nonce was invalidated:

1. Go to the block explorer for the respective network
2. Navigate to the Permit3 contract: `0xd635918A75356D133d5840eE5c9ED070302C9C60`
3. Read the `nonceBitmap` function with:
   - `owner`: The permit owner address
   - `wordPos`: The nonce divided by 256 (nonce >> 8)
4. Check if the bit at position (nonce % 256) is set

## Security Considerations

1. **Private Key Security**: Never commit the MIGRATION_PRIVATE_KEY to version control
2. **Test First**: Consider testing on a testnet first if available
3. **Backup**: Ensure database backups exist before running the migration
4. **Monitoring**: Monitor for any unusual claiming activity after the migration

## Support

If you encounter issues:

1. Check the migration report for specific error messages
2. Review the script logs for detailed error information
3. Open an issue at https://github.com/ubiquity/pay.ubq.fi/issues with:
   - The migration report (with sensitive data redacted)
   - Error messages from the console
   - Network and timestamp information