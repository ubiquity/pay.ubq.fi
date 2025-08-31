# Double Claim Repayment Tracking System - Handoff Document

## Overview

This document specifies the implementation of an automated system to track repayments from users who have performed double claims on permits. The system will monitor on-chain transactions to identify when beneficiaries send back funds, and automatically credit these repayments against their outstanding double claim debts.

## Background

When users double claim permits (claiming the same nonce on both Permit2 and Permit3 contracts), they receive duplicate payments. The current system detects these double claims and generates audit reports. The next phase requires:

1. **Debt Calculation**: Aggregate all double claims by beneficiary to calculate total debt
2. **Repayment Monitoring**: Watch for incoming transactions from flagged beneficiaries
3. **Automatic Reconciliation**: Credit repayments against debts using FIFO (oldest first) logic
4. **Updated Reporting**: Show current debt status after repayments

## Core Requirements

### 1. Enhanced Data Model

```typescript
interface DoubleClaimDebt {
  beneficiaryAddress: Address;
  totalDebt: {
    amount: bigint;
    usdValue: number; // estimated
    tokenAddress: Address;
    tokenSymbol: string;
    network: number;
  };
  claims: DoubleClaimRecord[];
  repayments: RepaymentRecord[];
  remainingDebt: {
    amount: bigint;
    usdValue: number;
  };
  lastUpdated: Date;
}

interface DoubleClaimRecord {
  permitId: string;
  nonce: string;
  claimAmount: bigint;
  tokenAddress: Address;
  tokenSymbol: string;
  network: number;
  originalTx: string;
  doubleTx: string;
  claimDate: Date;
  usdValueAtTime: number;
  status: 'outstanding' | 'partially_repaid' | 'fully_repaid';
  repaidAmount: bigint;
}

interface RepaymentRecord {
  txHash: string;
  fromAddress: Address;
  toAddress: Address; // should match treasury/recovery address
  amount: bigint;
  tokenAddress: Address;
  tokenSymbol: string;
  network: number;
  blockNumber: number;
  timestamp: Date;
  usdValueAtTime: number;
  appliedToClaims: string[]; // permit IDs this repayment was credited against
}
```

### 2. Repayment Detection System

#### Transaction Monitoring
- **Watch Addresses**: Monitor transactions TO treasury/recovery addresses
- **Filter Criteria**: 
  - FROM address matches known double-claimers
  - Token type matches claimed tokens (USDC, USDT, WXDAI, etc.)
  - Minimum amount threshold to avoid dust/gas refunds
- **Networks**: Monitor Ethereum mainnet (1) and Gnosis Chain (100)

#### Detection Logic
```typescript
interface RepaymentDetector {
  // Monitor for incoming transactions to treasury addresses
  watchForRepayments(treasuryAddresses: Address[]): AsyncGenerator<RepaymentCandidate>;
  
  // Validate if transaction is a legitimate repayment
  validateRepayment(tx: RepaymentCandidate, knownDebts: DoubleClaimDebt[]): RepaymentRecord | null;
  
  // Historical scan for missed repayments
  scanHistoricalRepayments(fromBlock: number, toBlock: number): RepaymentRecord[];
}

interface RepaymentCandidate {
  txHash: string;
  from: Address;
  to: Address;
  value: bigint;
  tokenAddress: Address;
  network: number;
  blockNumber: number;
  timestamp: Date;
}
```

### 3. Debt Reconciliation Engine

#### FIFO Credit Application
```typescript
interface DebtReconciler {
  // Apply repayment to oldest outstanding claims first
  applyRepayment(
    beneficiary: Address, 
    repayment: RepaymentRecord, 
    outstandingClaims: DoubleClaimRecord[]
  ): {
    updatedClaims: DoubleClaimRecord[];
    fullyRepaidClaims: string[];
    remainingRepaymentAmount: bigint;
  };
  
  // Calculate current debt status
  calculateCurrentDebt(beneficiary: Address): DoubleClaimDebt;
  
  // Generate reconciliation report
  generateReconciliationReport(): DebtReconciliationReport;
}
```

#### Credit Logic
1. **Sort Claims**: Order double claims by date (oldest first)
2. **Apply Credits**: For each repayment:
   - Start with oldest outstanding claim
   - Credit full claim amount if repayment >= claim amount
   - Credit partial amount if repayment < claim amount
   - Move to next claim if repayment amount remaining
3. **Update Status**: Mark claims as `fully_repaid` or `partially_repaid`
4. **Track Excess**: Handle overpayments (credit toward future claims or hold as credit)

### 4. Enhanced Reporting System

#### Debt Status Report
```json
{
  "reportType": "debt_status",
  "generatedAt": "2025-01-31T10:00:00Z",
  "summary": {
    "totalBeneficiariesWithDebt": 5,
    "totalOutstandingDebtUSD": 8950.75,
    "totalRepaidUSD": 1200.50,
    "totalDoubleClaimsDetected": 63
  },
  "beneficiaries": [
    {
      "address": "0x1234...5678",
      "totalClaimedUSD": 1875.25,
      "totalRepaidUSD": 400.00,
      "remainingDebtUSD": 1475.25,
      "claimsCount": 16,
      "repaidClaimsCount": 3,
      "lastRepaymentDate": "2025-01-30T15:30:00Z",
      "claims": [...],
      "repayments": [...]
    }
  ]
}
```

#### Repayment Activity Report
- Recent repayment transactions
- Beneficiaries who have made partial payments
- Fully resolved cases
- Outstanding high-value debts

### 5. Implementation Architecture

#### File Structure
```
scripts/
├── debt-tracking/
│   ├── debt-tracker.ts              # Main orchestrator
│   ├── repayment-detector.ts        # Transaction monitoring
│   ├── debt-reconciler.ts           # FIFO credit logic
│   ├── price-oracle.ts              # USD valuation
│   └── reporting/
│       ├── debt-status-report.ts
│       └── repayment-activity-report.ts
└── enhanced-migration-with-debt.ts  # Updated main script
```

#### Database Schema (if needed)
```sql
-- Track repayment transactions
CREATE TABLE repayment_transactions (
  id SERIAL PRIMARY KEY,
  tx_hash VARCHAR(66) UNIQUE NOT NULL,
  from_address VARCHAR(42) NOT NULL,
  to_address VARCHAR(42) NOT NULL,
  amount NUMERIC(78,0) NOT NULL, -- Support up to 78 digit numbers
  token_address VARCHAR(42) NOT NULL,
  token_symbol VARCHAR(10) NOT NULL,
  network INTEGER NOT NULL,
  block_number BIGINT NOT NULL,
  timestamp TIMESTAMP NOT NULL,
  usd_value_at_time DECIMAL(18,2),
  applied_to_claims TEXT[], -- Array of permit IDs
  created_at TIMESTAMP DEFAULT NOW()
);

-- Track debt reconciliation state
CREATE TABLE debt_reconciliation (
  id SERIAL PRIMARY KEY,
  beneficiary_address VARCHAR(42) NOT NULL,
  permit_id VARCHAR(50) NOT NULL,
  original_claim_amount NUMERIC(78,0) NOT NULL,
  repaid_amount NUMERIC(78,0) DEFAULT 0,
  status VARCHAR(20) DEFAULT 'outstanding', -- 'outstanding', 'partially_repaid', 'fully_repaid'
  last_updated TIMESTAMP DEFAULT NOW(),
  UNIQUE(beneficiary_address, permit_id)
);
```

### 6. Configuration Requirements

#### Treasury Addresses
```typescript
const TREASURY_ADDRESSES: Record<number, Address[]> = {
  1: ['0x...'], // Ethereum mainnet treasury addresses
  100: ['0x...'] // Gnosis Chain treasury addresses
};
```

#### Token Contracts
```typescript
const MONITORED_TOKENS: Record<number, TokenConfig[]> = {
  1: [
    { address: '0x6b175474e89094c44da98b954eedeac495271d0f', symbol: 'DAI' },
    { address: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', symbol: 'USDC' },
    { address: '0xdac17f958d2ee523a2206206994597c13d831ec7', symbol: 'USDT' }
  ],
  100: [
    { address: '0xe91d153e0b41518a2ce8dd3d7944fa863463a97d', symbol: 'WXDAI' },
    { address: '0x4ecaba5870353805a9f068101a40e0f32ed605c6', symbol: 'USDT' },
    { address: '0xddafbb505ad214d7b80b1f830fccc89b60fb7a83', symbol: 'USDC' }
  ]
};
```

### 7. Implementation Phases

#### Phase 1: Basic Debt Tracking (Week 1)
- [ ] Enhance existing double claim detection to calculate debts
- [ ] Create debt aggregation by beneficiary
- [ ] Generate debt status reports
- [ ] Add to package.json as `bun run permit:debt:status`

#### Phase 2: Repayment Detection (Week 2)
- [ ] Implement transaction monitoring for treasury addresses
- [ ] Create repayment validation logic
- [ ] Historical scan for existing repayments
- [ ] Add to package.json as `bun run permit:debt:scan-repayments`

#### Phase 3: Automatic Reconciliation (Week 3)
- [ ] Implement FIFO credit application logic
- [ ] Real-time debt updates when repayments detected
- [ ] Enhanced reporting with reconciliation status
- [ ] Add to package.json as `bun run permit:debt:reconcile`

#### Phase 4: Monitoring & Alerts (Week 4)
- [ ] Continuous monitoring service
- [ ] Alert system for new repayments
- [ ] Dashboard for debt management
- [ ] Integration with existing audit workflows

### 8. Security Considerations

#### Validation Rules
- **Address Verification**: Ensure repayment sender matches double claimer
- **Amount Validation**: Verify token amounts and prevent manipulation
- **Network Consistency**: Match repayment network with original claims
- **Duplicate Prevention**: Prevent double-counting of repayments

#### Access Control
- **Read Access**: Debt status available to auditors
- **Write Access**: Only automated system can update reconciliation
- **Manual Override**: Admin interface for dispute resolution

### 9. Example Usage Scenarios

#### Scenario 1: Partial Repayment
```
User 0x1234 double claimed:
- Permit #1488: 100 USDC (oldest)
- Permit #1769: 200 USDC (newer)
- Total debt: 300 USDC

User sends 150 USDC repayment:
- Credit 100 USDC → Permit #1488 (fully repaid)
- Credit 50 USDC → Permit #1769 (partially repaid)
- Remaining debt: 150 USDC on Permit #1769
```

#### Scenario 2: Overpayment
```
User 0x5678 has 100 USDC debt
User sends 120 USDC repayment:
- Credit 100 USDC → Full debt repaid
- Hold 20 USDC as credit for future claims/refund
```

#### Scenario 3: Multi-Token Repayment
```
User double claimed 100 USDC + 50 DAI
User repays 75 USDC:
- Credit against USDC claims first (FIFO within token type)
- DAI debt remains outstanding
- Mixed-token reconciliation logic needed
```

### 10. Testing Strategy

#### Unit Tests
- [ ] Debt calculation accuracy
- [ ] FIFO credit application logic
- [ ] Repayment validation rules
- [ ] Edge cases (overpayments, partial payments)

#### Integration Tests
- [ ] End-to-end debt tracking workflow
- [ ] Cross-chain transaction monitoring
- [ ] Database consistency checks
- [ ] Report generation accuracy

#### Mock Data Tests
- [ ] Simulate various repayment scenarios
- [ ] Test with historical double claim data
- [ ] Validate USD value calculations
- [ ] Performance testing with large datasets

### 11. Monitoring & Observability

#### Metrics to Track
- Daily repayment volume by token/network
- Average time to first repayment after double claim
- Percentage of double claimers who repay
- Debt aging (time since double claim)

#### Alerts
- Large repayments (>$1000)
- New repayments from known double claimers
- System errors in debt reconciliation
- Unexpected token transfers to treasury

### 12. Package.json Scripts

Add these commands to make the system easily accessible:

```json
{
  "scripts": {
    "permit:debt:status": "bun run scripts/debt-tracking/debt-status-report.ts",
    "permit:debt:scan": "bun run scripts/debt-tracking/scan-repayments.ts",
    "permit:debt:reconcile": "bun run scripts/debt-tracking/reconcile-debts.ts",
    "permit:debt:monitor": "bun run scripts/debt-tracking/monitor-repayments.ts",
    "permit:migrate:with-debt": "bun run scripts/enhanced-migration-with-debt.ts --dry-run"
  }
}
```

### 13. Future Enhancements

#### Advanced Features
- **Automated Notifications**: Email/Slack alerts for repayments
- **Payment Plans**: Track agreed-upon repayment schedules  
- **Interest Calculations**: Apply time-based penalties
- **Multi-Sig Integration**: Automated fund recovery via governance
- **Legal Integration**: Generate court-ready documentation

#### Analytics Dashboard
- Debt recovery rates by time period
- Top repayers vs non-compliant users
- Financial impact analysis
- Trend analysis for double claim prevention

---

## Implementation Notes

This system should integrate seamlessly with the existing enhanced migration script while adding comprehensive debt tracking capabilities. The FIFO approach ensures fair and transparent reconciliation, while the automated monitoring reduces manual overhead for ongoing audits.

The modular design allows for incremental implementation and testing, with each phase building upon the previous functionality. All outputs should continue to be generated in the git-ignored `./reports/` directory to maintain clean repository hygiene.

**Key Success Metrics:**
- 100% accurate debt calculations
- Real-time repayment detection (<5 minute delay)
- Zero false positives in repayment matching
- Complete audit trail for all reconciliation activities
- Reduced manual effort in debt tracking by 90%