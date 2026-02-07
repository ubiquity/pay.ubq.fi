import type { Address, Chain } from "viem";
import type { PermitData } from "../types.ts";
import { PermitRow } from "./permit-row.tsx";

interface PermitsTableProps {
  permits: PermitData[];
  claimablePermits: PermitData[];
  onClaimPermit: (permit: PermitData) => Promise<{ success: boolean; txHash: string }>;
  onClaimPermits: (permit: PermitData[]) => Promise<void>;
  onInvalidatePermit?: (permit: PermitData) => Promise<{ success: boolean; txHash: string }>;
  onDismissPermit?: (permit: PermitData) => void;
  isConnected: boolean;
  chain: Chain | undefined;
  isLoading: boolean;
  isQuoting: boolean;
  preferredRewardTokenAddress: Address | null;
  isFundingWallet: boolean;
  address: Address | undefined;
  githubUsernames: Map<number, string>;
  isInvalidating?: Record<string, boolean>;
}

export function PermitsTable({
  permits,
  onClaimPermit,
  onInvalidatePermit,
  onDismissPermit,
  isConnected,
  chain,
  isLoading,
  isQuoting,
  preferredRewardTokenAddress,
  isFundingWallet,
  address,
  githubUsernames,
  isInvalidating = {},
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
          <div className="permits-list">
            <div className="permits-body">
              {sortedPermits.map((permit) => {
                const githubUsername = permit.beneficiaryUserId ? githubUsernames.get(permit.beneficiaryUserId) : undefined;
                const invalidatingThis = Boolean(isInvalidating[permit.signature]);
                return (
                  <PermitRow
                    key={permit.signature}
                    permit={permit}
                    onClaimPermit={onClaimPermit}
                    onInvalidatePermit={onInvalidatePermit}
                    onDismissPermit={onDismissPermit}
                    isConnected={isConnected}
                    chain={chain}
                    isQuoting={isQuoting}
                    preferredRewardTokenAddress={preferredRewardTokenAddress}
                    isFundingWallet={isFundingWallet}
                    address={address}
                    githubUsername={githubUsername}
                    isInvalidating={invalidatingThis}
                  />
                );
              })}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
