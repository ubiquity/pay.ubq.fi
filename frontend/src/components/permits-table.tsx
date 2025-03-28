import React from 'react';
import type { PermitData } from '../../../shared/types';
import { PermitRow } from './permit-row.tsx'; // Import the row component with extension
import type { Chain } from 'viem'; // Import Chain type if needed for props

interface PermitsTableProps {
  permits: PermitData[];
  onClaimPermit: (permit: PermitData) => void;
  isConnected: boolean;
  chain: Chain | undefined; // Pass chain info down
  isConfirming: boolean; // Pass confirmation status
  confirmingHash: `0x${string}` | undefined; // Pass the hash being confirmed
  isLoading: boolean; // Add loading state prop
}

export function PermitsTable({
  permits,
  onClaimPermit,
  isConnected,
  chain,
  isConfirming,
  confirmingHash,
  isLoading, // Destructure isLoading
}: PermitsTableProps) {
  // Show spinner while loading
  if (isLoading) {
    // You might want a more styled spinner component later
    return <div className="section-loading-indicator"><div className="spinner"></div> Loading permits...</div>;
  }

  // Show message only after loading is finished and there are no permits
  if (permits.length === 0) {
    return <p>No permits pending.</p>;
  }

  // Render table if not loading and permits exist
  return (
    <table className="permits-table">
      <thead>
        <tr>
          <th>Type</th>
          <th>Token Address</th>
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
