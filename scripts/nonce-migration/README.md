# Simple Nonce Migration Guide

This guide provides a bulletproof solution for migrating ~800 nonces from Permit2 to Permit3 on Gnosis chain.

## Overview

The migration consists of 3 simple scripts that solve the core issues you were facing:

1. **Sequential Transaction Sending** - No parallel nonce conflicts
2. **Proper Nonce Management** - Automatic nonce tracking and incrementation
3. **Simple Error Handling** - Clear retries and progress reporting
4. **Real Transaction Sending** - No complex batching that can fail

## Scripts

### 1. `extract-migration-nonces.ts` 
Analyzes your database and determines which nonces need migration.

### 2. `simple-nonce-migration.ts`
The core migration script that sends transactions sequentially.

### 3. `test-nonce-migration.ts`
Test version with sample data for validation.

## Quick Start

### Step 1: Set Environment Variables

```bash
# Required for database access
export SUPABASE_URL="your_supabase_url"
export SUPABASE_SERVICE_ROLE_KEY="your_service_role_key"

# Required for sending transactions (use your private key)
export MIGRATION_PRIVATE_KEY="0x1234..." # Your private key for the funding wallet

# Optional: Custom Gnosis RPC (default: https://rpc.gnosischain.com)
export GNOSIS_RPC_URL="https://your-custom-rpc-url"
```

### Step 2: Analyze Your Data

```bash
# This will take a few minutes to check all nonces against the contracts
bun scripts/extract-migration-nonces.ts
```

This creates:
- `migration-nonces-analysis.json` - Detailed analysis report
- `scripts/run-migration.ts` - Generated script with your specific nonces

### Step 3: Test with Dry Run

```bash
# Test the generated migration plan
bun scripts/run-migration.ts --dry-run
```

### Step 4: Execute Migration

```bash
# Send the actual transactions
bun scripts/run-migration.ts
```

## How It Works

### Sequential Processing
- Gets current nonce from chain
- Sends transaction with explicit nonce
- Waits for confirmation before sending next
- Increments nonce for next transaction

### Nonce Bitmap Optimization
- Groups nonces by word position (every 256 nonces)
- Creates bitmap for efficient invalidation
- One transaction can invalidate multiple nonces if they're in the same word

### Error Handling
- Retries failed transactions up to 3 times
- Continues with next transaction even if one fails
- Tracks success/failure rates
- Provides clear error messages

### Gas Management
- Uses fixed gas limit (100,000) to avoid estimation issues
- No complex gas price calculations
- Lets Gnosis chain handle gas pricing

## Expected Performance

Based on your ~800 nonces:

- **Analysis**: 5-10 minutes (one-time)
- **Transactions**: ~30-45 transactions (grouped by word position)  
- **Total Time**: 10-15 minutes (2 seconds between transactions)
- **Gas Cost**: ~0.001 XDAI per transaction (~0.03-0.05 XDAI total)

## Transaction Format

Each transaction calls:
```solidity
invalidateUnorderedNonces(uint256 wordPos, uint256 mask)
```

Where:
- `wordPos` = nonce >> 8 (groups of 256)  
- `mask` = bitmap of which nonces in that word to invalidate

## Troubleshooting

### Common Issues

**"MIGRATION_PRIVATE_KEY must be set"**
- Set your private key environment variable
- Make sure it starts with "0x"

**"Failed to fetch permits"**
- Check SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
- Ensure your Supabase credentials are correct

**"Transaction failed: insufficient funds"**
- Ensure your wallet has XDAI for gas fees
- Need ~0.05 XDAI total for ~800 nonces

**"Nonce too low" error**
- Script automatically handles this with retries
- May indicate another process is using the same wallet

### Recovery

If the script fails partway through:
1. Check which transactions succeeded on Gnosisscan
2. Edit the generated nonce list to remove successful ones
3. Re-run the script with remaining nonces

## Safety Features

- **Dry-run mode** - Test without sending transactions
- **Clear logging** - See exactly what's happening
- **Transaction links** - Direct links to view on Gnosisscan
- **Progress tracking** - Know exactly where you are
- **Error recovery** - Continue even if some transactions fail

## Example Output

```
🚀 Simple Sequential Nonce Migration
===================================
Target contract: 0xd635918A75356D133d5840eE5c9ED070302C9C60
RPC URL: https://rpc.gnosischain.com
Mode: LIVE
Nonces to migrate: 800

📦 Prepared 35 transactions:
   1. wordPos=15, nonces=[4007,4008,4009...] (23 total)
   2. wordPos=16, nonces=[4100,4101,4102...] (18 total)
   ...

💰 Using account: 0x1234567890123456789012345678901234567890

🔢 Starting nonce: 42

🚀 Sending 35 transactions sequentially...

📋 Transaction 1/35:
  📤 Sending: wordPos=15, nonces=[4007,4008,4009...] (23 total)
     Nonce: 42, WordPos: 15, Bitmap: 0x7fffff
  ✅ Transaction sent: 0xabcdef...
     ⏳ Waiting for confirmation...
     ✅ Confirmed in block 12345678
     🔗 View on Gnosisscan: https://gnosisscan.io/tx/0xabcdef...

📊 Progress: 3% (1 sent, 0 failed)
⏳ Waiting 2 seconds before next transaction...

...

==================================================
🎉 MIGRATION COMPLETE!
==================================================
✅ Successful transactions: 35
❌ Failed transactions: 0
📊 Success rate: 100%
```

## Advanced Usage

### Custom Nonce List

If you want to migrate specific nonces:

```typescript
// Edit scripts/run-migration.ts
const migrationNonces = [
  4007n,
  4008n,
  // ... your nonces
];
```

### Different RPC Endpoint

```bash
export GNOSIS_RPC_URL="https://your-preferred-rpc.com"
```

### Faster Execution

Reduce the delay between transactions (not recommended for large batches):

```typescript
// In simple-nonce-migration.ts, change:
await new Promise(resolve => setTimeout(resolve, 2000)); // 2 seconds
// to:
await new Promise(resolve => setTimeout(resolve, 1000)); // 1 second
```

## Why This Works

1. **No Parallel Conflicts** - Sequential sending eliminates nonce race conditions
2. **Simple Architecture** - Less complexity = fewer failure points
3. **Proper Wait Logic** - Waits for confirmation before next transaction
4. **Real Transaction Sending** - No complex batching that can hide failures
5. **Clear Error Messages** - Easy to debug when something goes wrong

This approach prioritizes **reliability over speed** - exactly what you need for a critical migration.
