import React from "react";
import type { PermitData } from "../types";
import { PermitRow } from "./permit-row.tsx";
import type { Chain } from "viem";

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
  isLoading, // Destructure isLoading - Will be used to conditionally render the table
}: PermitsTableProps) {
  // Loading state is now handled in DashboardPage

  // Show message only if NOT loading and there are no permits
  if (permits.length === 0 && !isLoading) {
    return (
      <section>
        <div className="error-message">
          <span>No permits pending</span>
        </div>
      </section>
    );
  }

  // Render table only if NOT loading and permits exist
  return (
    <>
      {/* Render table only when not loading and permits exist */}
      {!isLoading && permits.length > 0 && (
        <table className="permits-table">
          <thead>
            <tr>
              <th>Source</th>
              <th>Reward</th>
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
      )}
    </>
  );
}
