import { useCallback, useEffect, useMemo, useState } from "react";
import { Address, formatUnits } from "viem";
import { useAccount, useDisconnect, usePublicClient, useSwitchChain, useWalletClient } from "wagmi";
import { NEW_PERMIT2_ADDRESS, OLD_PERMIT2_ADDRESS } from "../constants/config.ts";
import { getTokenInfo } from "../constants/supported-reward-tokens.ts";
import { useGithubUsernames } from "../hooks/use-github-usernames.ts";
import { usePermitClaiming } from "../hooks/use-permit-claiming.ts";
import { usePermitData } from "../hooks/use-permit-data.ts";
import { usePermitInvalidation } from "../hooks/use-permit-invalidation.ts";
import { PermitData } from "../types.ts";
import { hasRequiredFields } from "../utils/permit-utils.ts";
import { ICONS } from "./iconography.tsx";
import { LogoSpan } from "./login-page.tsx";
import { PermitsTable } from "./permits-table.tsx";
import { PreferredTokenSelectorButton } from "./preferred-token-selector-button.tsx";
import { TxBanner } from "./tx-banner.tsx";

function isUserRejectedRequest(error: unknown): boolean {
  if (!error) return false;

  const maybeAny = error as { code?: unknown; name?: unknown; shortMessage?: unknown; message?: unknown };
  if (maybeAny && typeof maybeAny === "object") {
    if (maybeAny.code === 4001) return true; // EIP-1193 userRejectedRequest
    if (typeof maybeAny.name === "string" && maybeAny.name.toLowerCase().includes("userrejected")) return true;
  }

  const message =
    typeof maybeAny?.shortMessage === "string"
      ? maybeAny.shortMessage
      : error instanceof Error
        ? error.message
        : typeof maybeAny?.message === "string"
          ? maybeAny.message
          : String(error);

  return /user rejected|user denied|rejected the request|denied transaction signature|request rejected|action_rejected/i.test(message);
}

export function DashboardPage() {
  // UI State
  const [isTableVisible, setIsTableVisible] = useState(false);
  const [preferredRewardTokenAddress, setPreferredRewardTokenAddress] = useState<Address | null>(null);
  const [lastTx, setLastTx] = useState<{ txHash: string; chainId: number; label: string } | null>(null);
  const [claimAllSnapshot, setClaimAllSnapshot] = useState<{ amountDisplay: string; rewardCount: number } | null>(null);

  type PendingNetworkAction = "claim" | "invalidate";

  const [pendingNetworkSwitch, setPendingNetworkSwitch] = useState({
    isSwitching: false,
    expectedNetworkId: null as number | null,
    action: "claim" as PendingNetworkAction,
    permits: [] as PermitData[],
  });

  // Wallet Connection Logic
  const { address, isConnected, chain } = useAccount();
  const { disconnect } = useDisconnect();
  const { switchChainAsync } = useSwitchChain();
  const publicClient = usePublicClient({ chainId: chain?.id });
  const { data: walletClient } = useWalletClient();

  // Custom Hook for Data Fetching & Management
  const {
    permits,
    setPermits,
    balancesAndAllowances,
    setBalancesAndAllowances,
    isLoading,
    error: dataError,
    setError,
    updatePermitStatusCache,
    isQuoting,
    isFundingWallet,
  } = usePermitData({
    address,
    isConnected,
    preferredRewardTokenAddress,
    chainId: chain?.id,
  });

  const { usernames: githubUsernames } = useGithubUsernames(permits);

  // --- Calculations (Depend on permits state from usePermitData) ---
  const claimablePermits = useMemo(() => {
    const normalizedAddress = address?.toLowerCase();
    if (!normalizedAddress) return [];

    const availableClaimAmount = new Map(Array.from(balancesAndAllowances.entries()).map(([key, value]) => [key, value.maxClaimable]));
    const filteredPermits = permits
      .filter((p) => p.beneficiary.toLowerCase() === normalizedAddress)
      .filter(
        (p) =>
          p.type === "erc20-permit" &&
          p.status !== "Claimed" &&
          p.claimStatus !== "Success" &&
          p.claimStatus !== "Pending" &&
          p.ownerBalanceSufficient !== false &&
          p.permit2AllowanceSufficient !== false &&
          !p.checkError &&
          hasRequiredFields(p)
      )
      .sort((a, b) => (b.amount > a.amount ? 1 : b.amount < a.amount ? -1 : 0))
      .filter((permit) => {
        // Filter out permits that exceed the available claim amount
        const key = `${permit.networkId}-${permit.permit2Address}-${permit.token?.address}-${permit.owner}`;
        const availableAmount = availableClaimAmount.get(key) ?? 0n;
        if (availableAmount === 0n) {
          return false;
        }
        if (permit.amount > availableAmount) {
          return false;
        }
        availableClaimAmount.set(key, availableAmount - permit.amount);
        return true;
      });

    return filteredPermits;
  }, [permits, balancesAndAllowances, address]);

  const claimablePermitCount = claimablePermits.length;

  const invalidatablePermits = useMemo(() => {
    const normalizedAddress = address?.toLowerCase();
    if (!normalizedAddress) return [];
    return permits.filter((p) => p.owner.toLowerCase() === normalizedAddress && p.status !== "Claimed" && p.isNonceUsed !== true);
  }, [permits, address]);

  const invalidatablePermitCount = invalidatablePermits.length;

  const claimableTotalsByToken = useMemo(() => {
    const totals = new Map<string, { networkId: number; tokenAddress: Address; total: bigint }>();
    for (const permit of claimablePermits) {
      if (!permit.amount || !permit.tokenAddress) continue;
      const tokenAddress = permit.tokenAddress as Address;
      const key = `${permit.networkId}:${tokenAddress.toLowerCase()}`;
      const current = totals.get(key)?.total ?? 0n;
      totals.set(key, { networkId: permit.networkId, tokenAddress, total: current + permit.amount });
    }
    return totals;
  }, [claimablePermits]);

  const estimatedTotalValueDisplay = useMemo(() => {
    if (!preferredRewardTokenAddress) {
      if (claimableTotalsByToken.size === 1) {
        const [{ networkId, tokenAddress, total }] = Array.from(claimableTotalsByToken.values());
        const tokenInfo = getTokenInfo(networkId, tokenAddress);
        if (tokenInfo) {
          try {
            const formatted = parseFloat(formatUnits(total, tokenInfo.decimals));
            return `${formatted.toFixed(2)} ${tokenInfo.symbol}`;
          } catch {
            // fallthrough
          }
        }
      }

      // Fallback when multiple tokens are claimable or token metadata is unknown.
      return `${claimablePermitCount} Reward${claimablePermitCount !== 1 ? "s" : ""}`;
    }

    const preferredTokenInfo = getTokenInfo(chain?.id, preferredRewardTokenAddress);
    if (!preferredTokenInfo) {
      return `${claimablePermitCount} Reward${claimablePermitCount !== 1 ? "s" : ""} (Unknown Pref Token)`;
    }

    let totalEstimatedValueInWei = 0n;
    const permitsToConsider = permits.filter((p) => claimablePermits.some((cp) => cp.nonce === p.nonce && cp.networkId === p.networkId));

    permitsToConsider.forEach((permit) => {
      if (permit.tokenAddress?.toLowerCase() === preferredRewardTokenAddress.toLowerCase()) {
        if (permit.amount) {
          try {
            totalEstimatedValueInWei += BigInt(permit.amount);
          } catch (e) {
            console.error(`Error parsing original amount for estimatedTotalValue calc: ${permit.amount}`, e);
          }
        }
      } else if (permit.estimatedAmountOut) {
        try {
          totalEstimatedValueInWei += BigInt(permit.estimatedAmountOut);
        } catch (e) {
          console.error(`Error parsing estimated amount for estimatedTotalValue calc: ${permit.estimatedAmountOut}`, e);
        }
      }
    });

    try {
      const formattedValue = parseFloat(formatUnits(totalEstimatedValueInWei, preferredTokenInfo.decimals));
      return `≈ ${formattedValue.toFixed(2)} ${preferredTokenInfo.symbol}`;
    } catch (e) {
      console.error("Error formatting estimated total value:", e);
      return `Error (${preferredTokenInfo.symbol})`;
    }
  }, [preferredRewardTokenAddress, chain?.id, permits, claimablePermits, claimableTotalsByToken, claimablePermitCount]);

  const { handleClaimPermit, handleClaimBatch, handleClaimSequential, isClaiming, sequentialClaimError, swapSubmissionStatus, walletConnectionError } =
    usePermitClaiming({
      permits,
      setPermits,
      setError,
      updatePermitStatusCache,
      publicClient: publicClient ?? null,
      walletClient: walletClient ?? null,
      address,
      chain: chain ?? null,
      setBalancesAndAllowances,
      preferredRewardTokenAddress,
    });

  const { handleInvalidatePermit, handleInvalidatePermitsBatch, isInvalidating } = usePermitInvalidation({
    setPermits,
    setError,
    updatePermitStatusCache,
    publicClient: publicClient ?? null,
    walletClient: walletClient ?? null,
    address,
    chain: chain ?? null,
  });

  const isInvalidatingAny = useMemo(() => Object.values(isInvalidating).some(Boolean), [isInvalidating]);

  const isClaimFlowActive = useMemo(
    () => isClaiming || (pendingNetworkSwitch.isSwitching && pendingNetworkSwitch.action === "claim"),
    [isClaiming, pendingNetworkSwitch.isSwitching, pendingNetworkSwitch.action]
  );

  const isInvalidationFlowActive = useMemo(
    () => isInvalidatingAny || (pendingNetworkSwitch.isSwitching && pendingNetworkSwitch.action === "invalidate"),
    [isInvalidatingAny, pendingNetworkSwitch.isSwitching, pendingNetworkSwitch.action]
  );

  const onInvalidatePermit = useCallback(
    async (permit: PermitData) => {
      const res = await handleInvalidatePermit(permit);
      if (res.success && res.txHash) {
        setLastTx({ txHash: res.txHash, chainId: permit.networkId, label: "Permit invalidated" });
      }
      return res;
    },
    [handleInvalidatePermit]
  );

  // --- UI Logic ---
  const toggleTableVisibility = () => {
    setIsTableVisible((prev) => !prev);
  };

  const handlePreferenceChange = (selectedAddress: Address | null) => {
    setPreferredRewardTokenAddress(selectedAddress);
    console.log("DashboardPage received preference change:", selectedAddress);
  };

  const claimPermits = useCallback(
    async (permitsToClaim: PermitData[]) => {
      if (!isConnected || !address || !chain) {
        console.error("Cannot claim permits: Wallet not connected or address/chain missing");
        return;
      }
      const currentNetworkId = chain.id;

      const permitsByNetwork = permitsToClaim.reduce((acc, permit) => {
        const key = permit.networkId;
        const permits = acc.get(key) || [];
        permits.push(permit);
        acc.set(key, permits);
        return acc;
      }, new Map<number, PermitData[]>());

      const networksToClaim = [currentNetworkId, ...Array.from(permitsByNetwork.keys()).filter((id) => id !== currentNetworkId)];

      for (const networkId of networksToClaim) {
        const permitsForNetwork = permitsByNetwork.get(networkId) || [];
        if (permitsForNetwork.length === 0) continue;

        try {
          if (currentNetworkId !== networkId) {
            console.log("Switching to network:", networkId);
            setPendingNetworkSwitch({ isSwitching: true, expectedNetworkId: networkId, action: "claim", permits: permitsToClaim });
            try {
              await switchChainAsync({ chainId: networkId });
            } catch (error) {
              setPendingNetworkSwitch({ isSwitching: false, expectedNetworkId: null, action: "claim", permits: [] });
              if (!isUserRejectedRequest(error)) {
                setError(`Network switch failed (chainId: ${networkId}).`);
              }
              return;
            }
            return;
          }
          const batchablePermits = permitsForNetwork.filter((p) => p.permit2Address.toLowerCase() === NEW_PERMIT2_ADDRESS.toLowerCase());
          const sequentialPermits = permitsForNetwork.filter((p) => p.permit2Address.toLowerCase() === OLD_PERMIT2_ADDRESS.toLowerCase());
          if (batchablePermits.length > 0) {
            console.log(`Claiming ${batchablePermits.length} batchable permits on network ${networkId}`);
            await handleClaimBatch(batchablePermits);
          }

          if (sequentialPermits.length > 0) {
            console.log(`Claiming ${sequentialPermits.length} sequential permits on network ${networkId}`);
            await handleClaimSequential(sequentialPermits);
          }
        } catch (error) {
          console.error(`Error claiming permits on network ${networkId}:`, error);
        }
      }
    },
    [isConnected, address, chain, switchChainAsync, handleClaimBatch, handleClaimSequential, setError]
  );

  const invalidatePermits = useCallback(
    async (permitsToInvalidate: PermitData[]) => {
      if (!isConnected || !address || !chain) {
        console.error("Cannot invalidate permits: Wallet not connected or address/chain missing");
        return;
      }
      const currentNetworkId = chain.id;
      const normalizedAddress = address.toLowerCase();
      const ownedPermits = permitsToInvalidate.filter((p) => p.owner.toLowerCase() === normalizedAddress);

      const permitsByNetwork = ownedPermits.reduce((acc, permit) => {
        const key = permit.networkId;
        const list = acc.get(key) || [];
        list.push(permit);
        acc.set(key, list);
        return acc;
      }, new Map<number, PermitData[]>());

      const networksToInvalidate = [currentNetworkId, ...Array.from(permitsByNetwork.keys()).filter((id) => id !== currentNetworkId)];

      for (const networkId of networksToInvalidate) {
        const permitsForNetwork = permitsByNetwork.get(networkId) || [];
        if (permitsForNetwork.length === 0) continue;

        try {
          if (currentNetworkId !== networkId) {
            console.log("Switching to network for invalidation:", networkId);
            setPendingNetworkSwitch({ isSwitching: true, expectedNetworkId: networkId, action: "invalidate", permits: ownedPermits });
            try {
              await switchChainAsync({ chainId: networkId });
            } catch (error) {
              setPendingNetworkSwitch({ isSwitching: false, expectedNetworkId: null, action: "claim", permits: [] });
              if (!isUserRejectedRequest(error)) {
                setError(`Network switch failed (chainId: ${networkId}).`);
              }
              return;
            }
            return;
          }

          const res = await handleInvalidatePermitsBatch(permitsForNetwork);
          const lastHash = res.txHashes.at(-1);
          if (lastHash) {
            setLastTx({ txHash: lastHash, chainId: networkId, label: "Permits invalidated" });
          }
          if (!res.success) return;
        } catch (error) {
          console.error(`Error invalidating permits on network ${networkId}:`, error);
          return;
        }
      }
    },
    [isConnected, address, chain, handleInvalidatePermitsBatch, switchChainAsync, setError]
  );

  useEffect(() => {
    if (
      isConnected &&
      walletClient &&
      chain &&
      pendingNetworkSwitch.isSwitching &&
      chain.id === pendingNetworkSwitch.expectedNetworkId &&
      pendingNetworkSwitch.expectedNetworkId
    ) {
      console.log(`Switched to expected network: ${chain.id}`);
      const action = pendingNetworkSwitch.action;
      const signatureSet = new Set(pendingNetworkSwitch.permits.map((p) => p.signature.toLowerCase()));

      const permitsToResume =
        action === "invalidate"
          ? invalidatablePermits.filter((p) => signatureSet.has(p.signature.toLowerCase()))
          : claimablePermits.filter((p) => signatureSet.has(p.signature.toLowerCase()));

      setPendingNetworkSwitch({ isSwitching: false, expectedNetworkId: null, action: "claim", permits: [] });

      if (action === "invalidate") {
        void invalidatePermits(permitsToResume).catch((error) => {
          console.error("Failed to resume invalidation flow after network switch:", error);
        });
        return;
      }

      void claimPermits(permitsToResume).catch((error) => {
        console.error("Failed to resume claim flow after network switch:", error);
      });
    }
  }, [isConnected, walletClient, chain, pendingNetworkSwitch, claimPermits, invalidatePermits, claimablePermits, invalidatablePermits]);

  // --- Rendering ---
  return (
    <>
      {/* Header Section */}
      <section id="header" className="header-logged-in">
        <div id="logo-wrapper">
          <h1>
            <LogoSpan />
            <span>Ubiquity</span>
            <span>Rewards</span>
          </h1>
        </div>

        {/* Header Buttons/Controls (Directly under #header) */}
        {isConnected && address ? (
          <>
            <button id="disconnect" onClick={() => disconnect()} className="button-with-icon">
              {ICONS.DISCONNECT}
              <span>{`${address.substring(0, 6)}...${address.substring(address.length - 4)}`}</span>
            </button>
            <button
              id="claim-all"
              onClick={() => {
                if (isFundingWallet) {
                  void invalidatePermits(invalidatablePermits).catch((error) => {
                    console.error("Failed to start invalidation flow:", error);
                  });
                  return;
                }

                if (claimablePermitCount > 0) {
                  setClaimAllSnapshot({ amountDisplay: estimatedTotalValueDisplay, rewardCount: claimablePermitCount });
                }

                void claimPermits(claimablePermits).catch((error) => {
                  console.error("Failed to start claim flow:", error);
                });
              }}
              disabled={
                isFundingWallet
                  ? isInvalidationFlowActive || !isConnected || invalidatablePermitCount === 0
                  : isClaimFlowActive || !isConnected || claimablePermitCount === 0
              }
              className="button-with-icon"
              title={isFundingWallet ? "Invalidate all valid permits (batched by nonce bitmap)" : "Claim all valid and available permits (batch RPC)"}
            >
              {isFundingWallet ? (
                isInvalidationFlowActive ? (
                  <div className="spinner button-spinner"></div>
                ) : (
                  ICONS.CLAIM
                )
              ) : isClaimFlowActive ? (
                <div className="spinner button-spinner"></div>
              ) : !isLoading && !isQuoting && claimablePermitCount === 0 ? (
                ICONS.CHECK
              ) : (
                ICONS.CLAIM
              )}
              <span>
                {isLoading ? (
                  isFundingWallet ? (
                    "Loading Invalidations..."
                  ) : (
                    "Loading Rewards..."
                  )
                ) : isQuoting && !isFundingWallet ? (
                  "Calculating..."
                ) : (
                  <>
                    {isFundingWallet ? (
                      <>
                        <span className="claim-amount">Invalidate all</span>
                        <span className="claim-count">
                          ({invalidatablePermitCount} Permit{invalidatablePermitCount !== 1 ? "s" : ""})
                        </span>
                      </>
                    ) : isClaimFlowActive ? (
                      <>
                        <span className="claim-amount">{claimAllSnapshot?.amountDisplay ?? estimatedTotalValueDisplay}</span>
                        <span className="claim-count">Claiming...</span>
                      </>
                    ) : claimablePermitCount === 0 ? (
                      <span className="claim-amount">All Claimed</span>
                    ) : (
                      <>
                        <span className="claim-amount">{estimatedTotalValueDisplay}</span>
                        <span className="claim-count">
                          ({claimablePermitCount} Reward{claimablePermitCount !== 1 ? "s" : ""})
                        </span>
                      </>
                    )}
                  </>
                )}
              </span>
            </button>
            <div className="spinner-or-expand-container">
              <button className="expand-button" disabled={isLoading} onClick={toggleTableVisibility} title={isTableVisible ? "Collapse" : "Expand"}>
                {isLoading ? <div className="spinner header-spinner"></div> : isTableVisible ? ICONS.CLOSER : ICONS.OPENER}
              </button>
            </div>
          </>
        ) : (
          <div>Wallet not connected.</div>
        )}
      </section>

      {/* Error Displays */}
      {dataError && (
        <section id="error-message-wrapper">
          <div className="error-message">
            {ICONS.WARNING}
            <span>{dataError}</span>
          </div>
        </section>
      )}
      {sequentialClaimError && (
        <section id="error-message-wrapper" style={{ marginTop: "5px" }}>
          <div className="error-message">
            {ICONS.WARNING}
            <span>{sequentialClaimError}</span>
          </div>
        </section>
      )}
      {walletConnectionError && (
        <section id="error-message-wrapper" style={{ marginTop: "5px" }}>
          <div className="error-message">
            {ICONS.WARNING}
            <span>{walletConnectionError}</span>
          </div>
        </section>
      )}
      {lastTx && <TxBanner txHash={lastTx.txHash} chainId={lastTx.chainId} label={lastTx.label} onDismiss={() => setLastTx(null)} />}

      {/* Swap Status Display */}
      {Object.keys(swapSubmissionStatus).length > 0 && (
        <section id="swap-status-wrapper" style={{ marginTop: "10px" }}>
          <h3>Swap Status:</h3>
          {Object.entries(swapSubmissionStatus).map(([key, status]) => (
            <div
              key={key}
              className={`swap-status ${status.status === "error" ? "error-message" : status.status === "submitted" ? "success-message" : "info-message"}`}
              style={{ marginBottom: "5px", padding: "5px", border: "1px solid #ccc", borderRadius: "4px" }}
            >
              {status.status === "error" && ICONS.WARNING}
              {status.status === "submitted" && ICONS.CLAIM}
              {status.status === "submitting" && (
                <div className="spinner" style={{ width: "12px", height: "12px", marginRight: "5px", display: "inline-block" }}></div>
              )}
              <span>{status.message}</span>
            </div>
          ))}
        </section>
      )}

      {/* Permits Table */}
      {isTableVisible && (
        <PermitsTable
          permits={permits}
          claimablePermits={claimablePermits}
          onClaimPermit={handleClaimPermit}
          onClaimPermits={claimPermits}
          onInvalidatePermit={onInvalidatePermit}
          isConnected={isConnected}
          chain={chain}
          isLoading={isLoading}
          isQuoting={isQuoting}
          preferredRewardTokenAddress={preferredRewardTokenAddress}
          isFundingWallet={isFundingWallet}
          address={address}
          githubUsernames={githubUsernames}
          isInvalidating={isInvalidating}
        />
      )}

      {/* Reward Preference Selector Button */}
      {isConnected && <PreferredTokenSelectorButton chainId={chain?.id} onPreferenceChange={handlePreferenceChange} />}
    </>
  );
}
