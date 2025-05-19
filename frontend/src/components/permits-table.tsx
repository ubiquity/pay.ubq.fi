import React, { useState } from "react";
import type { PermitData } from "../types.ts";
import { PermitRow } from "./permit-row.tsx";
import type { Chain, Address } from "viem";
import { PERMIT2_ADDRESS, PERMIT_AGGREGATOR_ADDRESS } from "../constants/config.ts";
import { ClaimAllProgress } from "./claim-all-progress.tsx";

interface PermitsTableProps {
  permits: PermitData[];
  onClaimPermit: (permit: PermitData) => Promise<{ success: boolean; txHash: string }>;
  onClaimAll: () => void;
  onAggregateClaim?: (permits: PermitData[]) => Promise<{ success: boolean; txHash: string }>;
  isConnected: boolean;
  chain: Chain | undefined;
  claimTxHash?: `0x${string}`;
  isLoading: boolean;
  isQuoting: boolean;
  preferredRewardTokenAddress: Address | null;
}

export function PermitsTable({
  permits,
  onClaimPermit,
  onClaimAll,
  onAggregateClaim,
  isConnected,
  chain,
  claimTxHash,
  isLoading,
  isQuoting,
  preferredRewardTokenAddress,
}: PermitsTableProps) {
  const [selectedPermits, setSelectedPermits] = useState<Set<string>>(new Set());

  // Split permits into aggregatable and regular
  // Only show valid and unprocessed permits
  const validPermits = permits.filter(p =>
    p.status === "Valid" &&
    p.claimStatus !== "Success" &&
    p.claimStatus !== "Pending"
  );

  // Split into aggregatable (new) and regular (old) permits
  const aggregatablePermits = validPermits.filter(p =>
    p.spender.toLowerCase() === PERMIT_AGGREGATOR_ADDRESS.toLowerCase()
  );
  const regularPermits = validPermits.filter(p =>
    p.spender.toLowerCase() === PERMIT2_ADDRESS.toLowerCase()
  );

  const togglePermitSelection = (permit: PermitData) => {
    const key = `${permit.nonce}-${permit.networkId}`;
    const newSelected = new Set(selectedPermits);
    if (selectedPermits.has(key)) {
      newSelected.delete(key);
    } else {
      newSelected.add(key);
    }
    setSelectedPermits(newSelected);
  };

  const isPermitSelected = (permit: PermitData) => {
    return selectedPermits.has(`${permit.nonce}-${permit.networkId}`);
  };

  const handleClaimSelected = async () => {
    if (!onAggregateClaim) return;

    const selectedPermitsList = aggregatablePermits.filter(permit =>
      selectedPermits.has(`${permit.nonce}-${permit.networkId}`)
    );

    if (selectedPermitsList.length > 0) {
      const result = await onAggregateClaim(selectedPermitsList);
      if (result.success) {
        setSelectedPermits(new Set()); // Clear selection after successful claim
      }
    }
  };

  // Show message only if NOT loading/quoting and there are no valid permits
  if (validPermits.length === 0 && !isLoading && !isQuoting) {
    return (
      <section>
        <div className="error-message">
          <span>No permits pending</span>
        </div>
      </section>
    );
  }

  // Render list only if NOT loading/quoting and permits exist
  return (
    <>
      {!isLoading && !isQuoting && validPermits.length > 0 && (
        <div>
          <div style={{ display: "flex", alignItems: "center", marginBottom: 12, gap: 12 }}>
            {regularPermits.length > 0 && (
              <button type="button" onClick={onClaimAll} className="claim-all-btn">
                Queue All Regular Claims
              </button>
            )}
            {aggregatablePermits.length > 0 && (
              <>
                <button
                  type="button"
                  onClick={handleClaimSelected}
                  disabled={selectedPermits.size === 0}
                  className="claim-selected-btn"
                >
                  Claim Selected ({selectedPermits.size})
                </button>
                <button
                  type="button"
                  onClick={() => onAggregateClaim?.(aggregatablePermits)}
                  disabled={aggregatablePermits.length === 0}
                  className="claim-all-btn"
                >
                  Batch Claim All
                </button>
              </>
            )}
            <ClaimAllProgress permits={permits} />
          </div>
          <div className="permits-list">
            <div className="permits-body">
              {validPermits.map((permit) => (
                <PermitRow
                  key={permit.nonce + permit.networkId}
                  permit={permit}
                  onClaimPermit={onClaimPermit}
                  isConnected={isConnected}
                  chain={chain}
                  confirmingHash={claimTxHash}
                  isQuoting={isQuoting}
                  preferredRewardTokenAddress={preferredRewardTokenAddress}
                  isSelected={isPermitSelected(permit)}
                  onSelect={togglePermitSelection}
                />
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
