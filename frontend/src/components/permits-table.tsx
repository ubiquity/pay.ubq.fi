import type { PermitData } from "../types";
import { PermitRow } from "./permit-row.tsx";
import type { Chain, Address } from "viem"; // Import Address type

interface PermitsTableProps {
  permits: PermitData[];
  onClaimPermit: (permit: PermitData) => void;
  isConnected: boolean;
  chain: Chain | undefined; // Pass chain info down
  isConfirming: boolean; // Pass confirmation status
  confirmingHash: `0x${string}` | undefined; // Pass the hash being confirmed
  isLoading: boolean; // Covers permit loading
  isQuoting: boolean; // Add quoting status prop
  preferredRewardTokenAddress: Address | null; // Add preferred token prop
}

export function PermitsTable({
  permits,
  onClaimPermit,
  isConnected,
  chain,
  isConfirming,
  confirmingHash,
  isLoading,
  isQuoting,
  preferredRewardTokenAddress, // Destructure preferred token
}: PermitsTableProps) {
  // Loading state is now handled in DashboardPage

  // Show message only if NOT loading/quoting and there are no permits
  if (permits.length === 0 && !isLoading && !isQuoting) {
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
      {/* Render list only when not loading/quoting and permits exist */}
      {!isLoading && !isQuoting && permits.length > 0 && (
        <div className="permits-list">

          {/* Body Rows */}
          <div className="permits-body">
            {permits.map((permit) => (
              <PermitRow
                key={permit.nonce + permit.networkId}
                permit={permit}
                onClaimPermit={onClaimPermit}
                isConnected={isConnected}
                chain={chain}
                isConfirming={isConfirming}
                confirmingHash={confirmingHash}
                isQuoting={isQuoting}
                preferredRewardTokenAddress={preferredRewardTokenAddress} // Pass down preferred token
              />
            ))}
          </div>
        </div>
      )}
    </>
  );
}
