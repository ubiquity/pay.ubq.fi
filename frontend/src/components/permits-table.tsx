import React from 'react';
import type { PermitData } from '../../../shared/types';
import { PermitRow } from './permit-row'; // Import the row component
import type { Chain } from 'viem'; // Import Chain type if needed for props

interface PermitsTableProps {
  permits: PermitData[];
  onClaimPermit: (permit: PermitData) => void;
  isConnected: boolean;
  chain: Chain | undefined; // Pass chain info down
  isConfirming: boolean; // Pass confirmation status
  confirmingHash: `0x${string}` | undefined; // Pass the hash being confirmed
}

export function PermitsTable({
  permits,
  onClaimPermit,
  isConnected,
  chain,
  isConfirming,
  confirmingHash,
}: PermitsTableProps) {
  if (permits.length === 0) {
    return <p>No permits found or fetched yet.</p>;
  }

  return (
    <table className="permits-table">
      <thead>
        <tr>
          <th>Type</th>
          <th>Token/NFT Address</th>
          <th className="align-right">Amount</th>
          <th>Beneficiary</th>
          <th>Status</th>
          <th>Source</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        {permits.map((permit) => (
          <PermitRow
            key={permit.nonce + permit.networkId}
            permit={permit}
            onClaimPermit={onClaimPermit}
            isConnected={isConnected}
            chain={chain}
            isConfirming={isConfirming}
            confirmingHash={confirmingHash}
          />
        ))}
      </tbody>
    </table>
  );
}
