import { useState } from "react";
import type { Address, Chain } from "viem";
import { NEW_PERMIT2_ADDRESS, OLD_PERMIT2_ADDRESS } from "../constants/config.ts";
import type { PermitData } from "../types.ts";
import { ClaimAllProgress } from "./claim-all-progress.tsx";
import { PermitRow } from "./permit-row.tsx";

interface PermitsTableProps {
  permits: PermitData[];
  onClaimPermit: (permit: PermitData) => Promise<{ success: boolean; txHash: string }>;
  onClaimPermits: (permit: PermitData[]) => Promise<void>;
  isConnected: boolean;
  chain: Chain | undefined;
  isLoading: boolean;
  isQuoting: boolean;
  preferredRewardTokenAddress: Address | null;
}

export function PermitsTable({
  permits,
  onClaimPermit,
  onClaimPermits,
  isConnected,
  chain,
  isLoading,
  isQuoting,
  preferredRewardTokenAddress,
}: PermitsTableProps) {
  const [selectedPermits, setSelectedPermits] = useState<Set<string>>(new Set());

  // Split permits into aggregatable and regular
  // Only show valid and unprocessed permits
  const validPermits = permits.sort((a, b) => (b.amount < a.amount ? -1 : b.amount > a.amount ? 1 : 0));

  // Split into aggregatable (new) and regular (old) permits
  const aggregatablePermits = validPermits.filter(
    (permit) =>
      permit.status === "Valid" &&
      permit.claimStatus !== "Success" &&
      permit.claimStatus !== "Pending" &&
      permit.permit2Address.toLowerCase() === NEW_PERMIT2_ADDRESS.toLowerCase()
  );
  const regularPermits = validPermits.filter(
    (permit) =>
      permit.status === "Valid" &&
      permit.claimStatus !== "Success" &&
      permit.claimStatus !== "Pending" &&
      permit.permit2Address.toLowerCase() === OLD_PERMIT2_ADDRESS.toLowerCase()
  );

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
    const selectedPermitsList = aggregatablePermits.filter((permit) => selectedPermits.has(permit.signature));

    if (selectedPermitsList.length > 0) {
      await onClaimPermits(selectedPermitsList);
      setSelectedPermits(new Set());
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
          <div>
            {regularPermits.length > 0 && (
              <button type="button" onClick={() => onClaimPermits(regularPermits)} className="claim-all-btn">
                Queue All Regular Claims
              </button>
            )}
            {aggregatablePermits.length > 0 && (
              <>
                <button type="button" onClick={handleClaimSelected} disabled={selectedPermits.size === 0} className="claim-selected-btn">
                  Claim Selected ({selectedPermits.size})
                </button>
                <button type="button" onClick={() => onClaimPermits(aggregatablePermits)} disabled={aggregatablePermits.length === 0} className="claim-all-btn">
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
