import { useState } from "react";
import type { Address, Chain } from "viem";
import { NEW_PERMIT2_ADDRESS, OLD_PERMIT2_ADDRESS } from "../constants/config.ts";
import type { PermitData } from "../types.ts";
import { ClaimAllProgress } from "./claim-all-progress.tsx";
import { PermitRow } from "./permit-row.tsx";

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
  const validPermits = permits.filter((p) => p.status === "Valid" && p.claimStatus !== "Success" && p.claimStatus !== "Pending");

  // Split into aggregatable (new) and regular (old) permits
  const aggregatablePermits = validPermits.filter((permit) => permit.permit2Address.toLowerCase() === NEW_PERMIT2_ADDRESS.toLowerCase());
  const regularPermits = validPermits.filter((permit) => permit.permit2Address.toLowerCase() === OLD_PERMIT2_ADDRESS.toLowerCase());

  const togglePermitSelection = (permit: PermitData) => {
    const key = permit.signature;
    const newSelected = new Set(selectedPermits);
    if (selectedPermits.has(key)) {
      newSelected.delete(key);
    } else {
      newSelected.add(key);
    }
    setSelectedPermits(newSelected);
  };

  const isPermitSelected = (permit: PermitData) => {
    return selectedPermits.has(permit.signature);
  };

  const handleClaimSelected = async () => {
    if (!onAggregateClaim) return;

    const selectedPermitsList = aggregatablePermits.filter((permit) => selectedPermits.has(permit.signature));

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
                <button type="button" onClick={handleClaimSelected} disabled={selectedPermits.size === 0} className="claim-selected-btn">
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
                  key={permit.signature}
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
