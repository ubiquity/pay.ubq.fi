import type { Address, Chain } from "viem";
import { useGithubUsernames } from "../hooks/use-github-usernames.ts";
import type { PermitData } from "../types.ts";
import { PermitRow } from "./permit-row.tsx";

interface PermitsTableProps {
  permits: PermitData[];
  onClaimPermit: (permit: PermitData) => Promise<{ success: boolean; txHash: string }>;
  onInvalidatePermit: (permit: PermitData) => Promise<{ success: boolean; txHash: string }>;
  isConnected: boolean;
  chain: Chain | undefined;
  claimTxHash?: `0x${string}`;
  isLoading: boolean;
  isQuoting: boolean;
  preferredRewardTokenAddress: Address | null;
  isFundingWallet: boolean;
  isInvalidating: Record<string, boolean>;
  address: Address | undefined;
}

export function PermitsTable({
  permits,
  onClaimPermit,
  onInvalidatePermit,
  isConnected,
  chain,
  claimTxHash,
  isLoading,
  isQuoting,
  preferredRewardTokenAddress,
  isFundingWallet,
  isInvalidating,
  address,
}: PermitsTableProps) {
  // Fetch GitHub usernames for all permits
  const { usernames: githubUsernames } = useGithubUsernames(permits);

  // The permits are already filtered by the API/database query, just use them directly
  // The API ensures funding wallets only get permits they own
  let validPermits = permits;

  // Always sort permits in reverse chronological order (newest first)
  validPermits = validPermits.sort((a, b) => {
    // If both have created_at timestamps, sort by them
    if (a.created_at && b.created_at) {
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    }
    // If only one has a timestamp, put it first
    if (a.created_at && !b.created_at) return -1;
    if (!a.created_at && b.created_at) return 1;
    // If neither has a timestamp, maintain original order
    return 0;
  });

  // Show message only if NOT loading/quoting and there are no valid permits
  if (validPermits.length === 0 && !isLoading && !isQuoting) {
    return (
      <section>
        <div className="error-message">
          <span>{isFundingWallet ? "No permits available to invalidate" : "No permits pending"}</span>
        </div>
      </section>
    );
  }

  // Render list only if NOT loading/quoting and permits exist
  return (
    <>
      {!isLoading && !isQuoting && validPermits.length > 0 && (
        <div>
          <div className="permits-list">
            {/* Headerless table design - cells are self-explanatory (Amount | Source | Actions) */}
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
                  isFundingWallet={isFundingWallet}
                  isInvalidating={isInvalidating[permit.signature] || false}
                  address={address}
                  githubUsername={permit.beneficiaryUserId ? githubUsernames.get(permit.beneficiaryUserId) : undefined}
                />
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
