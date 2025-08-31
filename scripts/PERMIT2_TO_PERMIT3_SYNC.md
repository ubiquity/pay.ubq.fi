# Permit2 to Permit3 Synchronization Tool

## Overview

This tool synchronizes permit nonces from Permit2 contracts (deployed on Ethereum Mainnet and Gnosis Chain) to the Permit3 contract on Gnosis Chain. It ensures that all used nonces from Permit2 are properly invalidated on Permit3 to maintain security and prevent replay attacks.

## Features

- **Multi-chain Support**: Reads nonce states from Permit2 on both Ethereum Mainnet (chain 1) and Gnosis Chain (chain 100)
- **Comprehensive Analysis**: Checks nonce status across all three contracts before syncing
- **Batch Processing**: Groups nonces by owner and word position for efficient gas usage
- **Detailed Reporting**: Generates comprehensive JSON reports of the migration process
- **Error Handling**: Robust error handling with partial success tracking
- **Safe Operations**: Simulates transactions before execution to prevent failures

## Prerequisites

1. **Environment Variables** (add to `.env` file):
   ```bash
   # Supabase credentials for fetching permit data
   SUPABASE_URL=your_supabase_url
   SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

   # Private key for the migration account (must have gas on Gnosis)
   MIGRATION_PRIVATE_KEY=0x_your_private_key

   # Optional: Custom RPC URL (defaults to https://rpc.ubq.fi)
   RPC_URL=https://your-rpc-url
   ```

2. **Dependencies**: Ensure all required packages are installed:
   ```bash
   bun install
   ```

3. **Gas Requirements**: The migration account must have sufficient xDAI on Gnosis Chain to pay for transactions

## Contract Addresses

- **Permit2 (Standard)**: `0x000000000022D473030F116dDEE9F6B43aC78BA3`
  - Deployed on: Ethereum Mainnet, Gnosis Chain
- **Permit3 (Custom)**: `0xd635918A75356D133d5840eE5c9ED070302C9C60`
  - Deployed on: Gnosis Chain

## How It Works

1. **Fetch Permits**: Retrieves all permit data from the Supabase database
2. **Filter by Chain**: Only processes permits from Mainnet (1) and Gnosis (100)
3. **Check Status**: For each permit, checks if the nonce is:
   - Used on Permit2 Mainnet
   - Used on Permit2 Gnosis
   - Already invalidated on Permit3 Gnosis
4. **Identify Sync Needs**: Marks permits that are used on Permit2 but not on Permit3
5. **Batch Preparation**: Groups nonces by owner and word position for efficient processing
6. **Execute Sync**: Calls `invalidateUnorderedNonces` on Permit3 to sync the state
7. **Generate Report**: Creates a detailed JSON report of the migration

## Usage

Run the synchronization tool:

```bash
bun run scripts/sync-permit2-to-permit3.ts
```

## Output

The tool provides:

1. **Console Output**: Real-time progress and status updates
2. **JSON Report**: Detailed report saved as `permit2-to-permit3-sync-{timestamp}.json`

### Report Structure

```json
{
  "timestamp": "2025-01-09T00:00:00.000Z",
  "migrationAccount": "0x...",
  "summary": {
    "totalPermitsAnalyzed": 100,
    "permitsNeedingSync": 25,
    "totalBatches": 5,
    "successfulBatches": 5,
    "failedBatches": 0
  },
  "permitAnalysis": [
    {
      "owner": "0x...",
      "nonce": "12345",
      "wordPos": "48",
      "bitPos": "57",
      "permit2Mainnet": true,
      "permit2Gnosis": false,
      "permit3Gnosis": false,
      "needsSync": true
    }
  ],
  "syncResults": [
    {
      "owner": "0x...",
      "noncesCount": 5,
      "success": true,
      "txHashes": ["0x..."]
    }
  ]
}
```

## Scenarios Handled

1. **Nonce used on Permit2 Mainnet only** → Syncs to Permit3
2. **Nonce used on Permit2 Gnosis only** → Syncs to Permit3
3. **Nonce used on both Permit2 contracts** → Syncs to Permit3
4. **Nonce already on Permit3** → Skips (no action needed)
5. **Nonce not used anywhere** → Skips (no action needed)

## Error Handling

- **RPC Failures**: Logs errors and continues with next batch
- **Transaction Failures**: Records partial success and continues
- **Invalid Data**: Safely handles missing or malformed permit data
- **Rate Limiting**: Includes delays between batches to prevent rate limit issues

## Gas Optimization

The tool optimizes gas usage by:
- Batching multiple nonces into single transactions using bitmap operations
- Grouping nonces by word position (256 nonces per word)
- Only syncing nonces that actually need synchronization

## Security Considerations

- **Private Key**: Never commit your private key to version control
- **Permissions**: Only the migration account can invalidate nonces it owns
- **Verification**: Always verify the migration report before considering the sync complete
- **Backup**: Keep the JSON reports as audit trails

## Troubleshooting

### Common Issues

1. **"MIGRATION_PRIVATE_KEY must be set"**
   - Ensure your `.env` file contains the private key
   - Format: `MIGRATION_PRIVATE_KEY=0x...` (64 hex characters after 0x)

2. **"Insufficient funds"**
   - Add xDAI to your migration account on Gnosis Chain
   - Check balance at: https://gnosisscan.io

3. **"Failed to check nonce status"**
   - Check RPC endpoint connectivity
   - Verify contract addresses are correct
   - Ensure RPC has archive node access if checking old nonces

4. **"Transaction simulation failed"**
   - Verify the migration account owns the nonces being invalidated
   - Check that Permit3 contract is deployed and accessible

## Testing

To test with a small subset:
1. Modify the database query in `fetchPermitsFromDatabase` to limit results
2. Or create a test database with sample permits
3. Run the script with test environment variables

## Monitoring

Monitor the sync progress:
- **Gnosisscan**: Track transactions at https://gnosisscan.io/address/[your-migration-account]
- **Logs**: Review console output for detailed progress
- **Reports**: Check JSON reports for complete sync status

## Important Notes

- This is a one-way sync from Permit2 → Permit3
- Once a nonce is invalidated, it cannot be un-invalidated
- The tool is idempotent - running it multiple times is safe
- Always review the report to ensure all expected permits were synced
