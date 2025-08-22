import { useState } from "react";
import type { Address, Chain } from "viem";
import { NEW_PERMIT2_ADDRESS, OLD_PERMIT2_ADDRESS } from "../constants/config.ts";
import type { PermitData } from "../types.ts";
import { ClaimAllProgress } from "./claim-all-progress.tsx";
import { PermitRow } from "./permit-row.tsx";

interface PermitsTableProps {
  permits: PermitData[];
  onClaimPermit: (permit: PermitData) => Promise<{ success: boolean; txHash: string }>;
  onClaimSequential: (permits: PermitData[]) => void;
  onClaimBatch: (permits?: PermitData[]) => Promise<{ success: boolean; txHash: string }>;
  onInvalidatePermit: (permit: PermitData) => Promise<{ success: boolean; txHash: string }>;
  isConnected: boolean;
  chain: Chain | undefined;
  claimTxHash?: `0x${string}`;
  isLoading: boolean;
  isQuoting: boolean;
  preferredRewardTokenAddress: Address | null;
  showOwnerPermits: boolean;
  isInvalidating: Record<string, boolean>;
  address: Address | undefined;
}

export function PermitsTable({
  permits,
  onClaimPermit,
  onClaimSequential,
  onClaimBatch,
  onInvalidatePermit,
  isConnected,
  chain,
  claimTxHash,
  isLoading,
  isQuoting,
  preferredRewardTokenAddress,
  showOwnerPermits,
  isInvalidating,
  address,
}: PermitsTableProps) {
  const [selectedPermits, setSelectedPermits] = useState<Set<string>>(new Set());

  // Split permits into aggregatable and regular
  // When showing owner permits, show all permits owned by the user (for invalidation)
  // Otherwise show only valid and unprocessed permits (for claiming)
  const validPermits = showOwnerPermits 
    ? permits 
    : permits.filter((p) => p.status === "Valid" && p.claimStatus !== "Success" && p.claimStatus !== "Pending");

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
    const selectedPermitsList = aggregatablePermits.filter((permit) => selectedPermits.has(permit.signature));

    if (selectedPermitsList.length > 0) {
      const result = await onClaimBatch(selectedPermitsList);
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
          <div>
            {regularPermits.length > 0 && (
              <button type="button" onClick={() => onClaimSequential(regularPermits)} className="claim-all-btn">
                Queue All Regular Claims
              </button>
            )}
            {aggregatablePermits.length > 0 && (
              <>
                <button type="button" onClick={handleClaimSelected} disabled={selectedPermits.size === 0} className="claim-selected-btn">
                  Claim Selected ({selectedPermits.size})
                </button>
                <button type="button" onClick={() => onClaimBatch(aggregatablePermits)} disabled={aggregatablePermits.length === 0} className="claim-all-btn">
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
                  onInvalidatePermit={onInvalidatePermit}
                  isConnected={isConnected}
                  chain={chain}
                  confirmingHash={claimTxHash}
                  isQuoting={isQuoting}
                  preferredRewardTokenAddress={preferredRewardTokenAddress}
                  isSelected={isPermitSelected(permit)}
                  onSelect={togglePermitSelection}
                  showOwnerPermits={showOwnerPermits}
                  isInvalidating={isInvalidating[permit.signature] || false}
                  address={address}
                />
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
