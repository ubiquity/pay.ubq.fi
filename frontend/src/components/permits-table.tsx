import type { PermitData } from "../types.ts";
import { PermitRow } from "./permit-row.tsx";
import type { Chain, Address } from "viem";

interface PermitsTableProps {
  permits: PermitData[];
  onClaimPermit: (permit: PermitData) => Promise<{ success: boolean; txHash: string }>;
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
  isConnected,
  chain,
  claimTxHash,
  isLoading,
  isQuoting,
  preferredRewardTokenAddress,
}: PermitsTableProps) {
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
      {!isLoading && !isQuoting && permits.length > 0 && (
        <div className="permits-list">
          <div className="permits-body">
            {permits.map((permit) => (
              <PermitRow
                key={permit.nonce + permit.networkId}
                permit={permit}
                onClaimPermit={onClaimPermit}
                isConnected={isConnected}
                chain={chain}
                confirmingHash={claimTxHash}
                isQuoting={isQuoting}
                preferredRewardTokenAddress={preferredRewardTokenAddress}
              />
            ))}
          </div>
        </div>
      )}
    </>
  );
}
