# Nonce Migration Agent

## Purpose
This agent specializes in migrating nonces from Uniswap's Permit2 contract to Permit3 contract on Gnosis chain to prevent double-claim vulnerabilities after contract upgrades.

## Context
The payment system encodes GitHub user IDs and issue IDs as nonces to prevent double payments. When Permit2 was upgraded to Permit3, all nonces were reset, creating a vulnerability where contributors could claim rewards twice. This agent handles the complex process of invalidating the old nonces in the new contract.

## Key Lessons Learned

### 1. **Nonce Security Model**
- Only the **owner** of nonces can invalidate them via `invalidateUnorderedNonces()`
- You CANNOT invalidate another owner's nonces (critical security feature)
- Nonces become invalid in two ways:
  1. Owner explicitly calls `invalidateUnorderedNonces()`
  2. A permit with that nonce is actually used/claimed

### 2. **Transaction Management**
- **Sequential > Parallel**: Send transactions one-by-one with proper nonce management
- Always increment nonce even on failures to avoid gaps
- Use fixed gas limits (100000) to avoid estimation issues
- Small delays between transactions (100-200ms) prevent RPC overload

### 3. **Gas Price Strategy**
- Gnosis gas is extremely cheap (< $0.000001 per transaction)
- Auto gas often sets prices too low, causing hours-long delays
- Use 5x current gas price for quick confirmations
- Total cost for ~700 transactions: ~$0.00015

### 4. **Common Issues & Solutions**

**Issue**: "ReplacementNotAllowed" errors
**Solution**: Transaction with that nonce already in mempool. Increment and continue.

**Issue**: Transactions confirming slowly over 12+ hours
**Solution**: Gas price too low. Speed up with replacement transactions at higher gas.

**Issue**: "Nonce too low" errors
**Solution**: Get fresh nonce from chain with `blockTag: "pending"`

**Issue**: Scripts timeout after sending hundreds of transactions
**Solution**: Normal - transactions continue confirming. Check with `getTransactionCount()`.

## Tools Created

### Core Migration Scripts

1. **`scripts/extract-migration-nonces.ts`**
   - Analyzes database for permits needing migration
   - Checks nonce status on both Permit2 and Permit3
   - Generates migration plan and cache

2. **`scripts/simple-nonce-migration.ts`**
   - Template for sequential migration
   - Proper nonce management and error handling
   - Groups nonces by word position for efficiency

3. **`scripts/sequential-migration.ts`**
   - Reads from cache and sends transactions sequentially
   - Waits for confirmations with timeout handling
   - Progress tracking and error recovery

4. **`scripts/blast-migration.ts`**
   - Fast sending without waiting for confirmations
   - Minimal delays (100ms) between transactions
   - Saves transaction hashes for tracking

5. **`scripts/continue-migration.ts`**
   - Resumes from specific transaction number
   - Handles partial completions
   - Maintains transaction count accuracy

6. **`scripts/speed-up-migration.ts`**
   - Replaces pending transactions with higher gas
   - Calculates gas within budget constraints
   - Handles "already known" errors gracefully

### Utility Scripts

7. **`scripts/check-migration-status.ts`**
   - Verifies on-chain migration status
   - Samples word positions to check bitmaps
   - Reports completion percentage

8. **`scripts/check-nonce.ts`**
   - Quick nonce checking utility
   - Shows transactions sent from starting point

## Migration Process

### Phase 1: Analysis
```bash
# Set environment variables
export SUPABASE_URL="..."
export SUPABASE_SERVICE_ROLE_KEY="..."
export MIGRATION_PRIVATE_KEY="0x..." # Wallet that pays gas

# Analyze and create cache
bun scripts/extract-migration-nonces.ts
```

### Phase 2: Migration
```bash
# Dry run first
bun scripts/sequential-migration.ts --dry-run

# Execute migration
bun scripts/blast-migration.ts

# If timeout, continue from checkpoint
bun scripts/continue-migration.ts

# If slow confirmations, speed up
bun scripts/speed-up-migration.ts
```

### Phase 3: Verification
```bash
# Check status
bun scripts/check-migration-status.ts

# Monitor on Gnosisscan
# https://gnosisscan.io/address/[WALLET_ADDRESS]
```

## Critical Implementation Details

### Nonce Bitmap Encoding
```typescript
function nonceBitmap(nonce: bigint): { wordPos: bigint; bitPos: bigint } {
  const wordPos = nonce >> 8n;  // Divide by 256
  const bitPos = nonce & 0xffn;  // Modulo 256
  return { wordPos, bitPos };
}
```

### Transaction Batching
- Group nonces by word position (every 256 nonces)
- Create bitmap for efficient invalidation
- One transaction can invalidate multiple nonces in same word

### Cache Structure
```typescript
{
  migrationBatches: [{
    owner: Address,
    status: "pending" | "submitted" | "completed",
    wordPosMap: {
      [wordPos: string]: bitmap // bigint as string
    }
  }]
}
```

## Error Recovery Strategies

1. **Transaction Timeouts**: Continue with next transaction, track failures
2. **Nonce Conflicts**: Increment nonce and retry
3. **Gas Too Low**: Replace with higher gas price transaction
4. **RPC Failures**: Retry with exponential backoff
5. **Partial Completion**: Use continue script from checkpoint

## Cost Estimates
- Gas per transaction: ~100,000 units
- Cost on Gnosis: ~$0.000001 per transaction
- 700 transactions: ~$0.0007 total
- Speed-up with 5x gas: ~$0.0035 total

## Monitoring Commands

```bash
# Check current wallet nonce
cast nonce [WALLET] --rpc-url https://rpc.gnosischain.com

# Check pending transactions
cast nonce [WALLET] --block pending --rpc-url https://rpc.gnosischain.com  

# View on explorer
open https://gnosisscan.io/address/[WALLET]
```

## Success Metrics
- All nonces for wallet owner successfully invalidated
- Transaction success rate > 99%
- Total gas cost < $0.01
- Completion within 1-2 hours (with proper gas)

## Important Warnings

⚠️ **NEVER** attempt to invalidate another owner's nonces directly - it will fail
⚠️ **ALWAYS** check cache before re-running to avoid duplicates  
⚠️ **IMMUTABLE** - Once a nonce is invalidated, it cannot be reversed
⚠️ **TEST** with dry-run first to verify transaction count

## Simple 10-Line Version
If all else fails, the entire migration can be done with:
```typescript
for (const batch of cache.migrationBatches) {
  for (const [wordPos, bitmap] of Object.entries(batch.wordPosMap)) {
    await wallet.writeContract({
      address: PERMIT3_ADDRESS,
      abi: ["function invalidateUnorderedNonces(uint256,uint256)"],
      functionName: "invalidateUnorderedNonces",
      args: [BigInt(wordPos), BigInt(bitmap)],
      nonce: nonce++,
    });
  }
}
```

## Contact & Resources
- Permit2 SDK: `@uniswap/permit2-sdk`
- Contract: `0xd635918A75356D133d5840eE5c9ED070302C9C60` (Permit3 on Gnosis)
- Gas Price Reference: https://gnosisscan.io/gastracker
- Double-claim detection: Check `transaction` field in permits table

## Agent Capabilities
This agent can:
- Analyze permits database for migration needs
- Execute batch nonce invalidations
- Handle transaction failures and retries
- Monitor and speed up slow transactions
- Verify migration completion
- Generate cost estimates
- Provide detailed progress reporting

This agent cannot:
- Invalidate nonces for other owners
- Reverse nonce invalidations
- Migrate permits across different chains
- Modify permit amounts or beneficiaries