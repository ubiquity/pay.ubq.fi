import type { Address, Chain } from "viem";
import type { PermitData } from "../types.ts";
import { ClaimAllProgress } from "./claim-all-progress.tsx";
import { PermitRow } from "./permit-row.tsx";

interface PermitsTableProps {
  permits: PermitData[];
  claimablePermits: PermitData[];
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
  isConnected,
  chain,
  isLoading,
  isQuoting,
  preferredRewardTokenAddress,
}: PermitsTableProps) {
  const sortedPermits = permits.sort((a, b) => (b.amount < a.amount ? -1 : b.amount > a.amount ? 1 : 0));

  // Show message only if NOT loading/quoting and there are no valid permits
  if (sortedPermits.length === 0 && !isLoading && !isQuoting) {
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
      {!isLoading && !isQuoting && sortedPermits.length > 0 && (
        <div>
          <div>
            <ClaimAllProgress permits={permits} />
          </div>
          <div className="permits-list">
            <div className="permits-body">
              {sortedPermits.map((permit) => (
                <PermitRow
                  key={permit.signature}
                  permit={permit}
                  onClaimPermit={onClaimPermit}
                  isConnected={isConnected}
                  chain={chain}
                  isQuoting={isQuoting}
                  preferredRewardTokenAddress={preferredRewardTokenAddress}
                />
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
