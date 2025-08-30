import { useCallback, useMemo, useState } from "react";
import { Address, formatUnits } from "viem";
import { useAccount, useDisconnect, usePublicClient, useWalletClient } from "wagmi";
import { getTokenInfo } from "../constants/supported-reward-tokens.ts";
import { usePermitClaiming } from "../hooks/use-permit-claiming.ts";
import { usePermitData } from "../hooks/use-permit-data.ts";
import { usePermitInvalidation } from "../hooks/use-permit-invalidation.ts";
import { hasRequiredFields } from "../utils/permit-utils.ts";
import { ICONS } from "./iconography.tsx";
import { LogoSpan } from "./login-page.tsx";
import { PermitsTable } from "./permits-table.tsx";
import { PreferredTokenSelectorButton } from "./preferred-token-selector-button.tsx";

export function DashboardPage() {
  // UI State
  const [isTableVisible, setIsTableVisible] = useState(false);
  const [preferredRewardTokenAddress, setPreferredRewardTokenAddress] = useState<Address | null>(null);


  // Wallet Connection Logic
  const { address, isConnected, chain } = useAccount();
  const { disconnect } = useDisconnect();

  // Custom Hook for Data Fetching & Management
  const {
    permits,
    setPermits,
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

  // --- Calculations (Depend on permits state from usePermitData) ---
  // Permits that are actually claimable (for claim all button)
  const claimablePermits = useMemo(() => {
    const filteredPermits = permits.filter(
      (p) =>
        p.networkId === chain?.id &&
        p.type === "erc20-permit" &&
        p.status !== "Claimed" &&
        p.claimStatus !== "Success" &&
        p.claimStatus !== "Pending" &&
        p.ownerBalanceSufficient !== false &&
        p.permit2AllowanceSufficient !== false &&
        !p.checkError &&
        hasRequiredFields(p)
    );
    return filteredPermits;
  }, [permits, chain?.id]);

  // All valid permits that should be displayed (including unclaimable ones)
  const displayablePermits = useMemo(() => {
    const filteredPermits = permits.filter(
      (p) =>
        p.networkId === chain?.id &&
        p.type === "erc20-permit" &&
        // Only exclude already claimed/invalidated permits
        p.status !== "Claimed" &&
        p.status !== "Invalidated" &&
        p.isNonceUsed !== true &&
        // Basic validation
        hasRequiredFields(p)
    );
    return filteredPermits;
  }, [permits, chain?.id]);

  const claimablePermitCount = claimablePermits.length;

  const claimableTotalValue = useMemo(() => {
    const assumedDecimals = 18;
    let totalSumInWei = 0n;
    for (const permit of claimablePermits) {
      if (permit.amount) {
        try {
          totalSumInWei += BigInt(permit.amount);
        } catch (e) {
          console.error(`Error parsing amount for claimableTotalValue calc: ${permit.amount}`, e);
        }
      }
    }
    try {
      return parseFloat(formatUnits(totalSumInWei, assumedDecimals));
    } catch (e) {
      console.error("Error formatting total sum:", e);
      return 0;
    }
  }, [claimablePermits]);

  const estimatedTotalValueDisplay = useMemo(() => {
    if (!preferredRewardTokenAddress) {
      return `$${claimableTotalValue.toFixed(2)}`;
    }

    const preferredTokenInfo = getTokenInfo(chain?.id, preferredRewardTokenAddress);
    if (!preferredTokenInfo) {
      return `$${claimableTotalValue.toFixed(2)} (Unknown Pref Token)`;
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
  }, [claimableTotalValue, preferredRewardTokenAddress, chain?.id, permits, claimablePermits]);

  // Custom Hook for Claiming Logic
  const publicClient = usePublicClient({ chainId: chain?.id });
  const { data: walletClient } = useWalletClient();

  // Custom Hook for Invalidation Logic
  const {
    handleInvalidatePermit,
    isInvalidating,
    invalidationError,
  } = usePermitInvalidation({
    setPermits,
    setError,
    updatePermitStatusCache,
    publicClient: publicClient ?? null,
    walletClient: walletClient ?? null,
    address,
    chain: chain ?? null,
  });

  const {
    handleClaimPermit,
    handleClaimBatch,
    handleClaimSequential,
    isClaimingSequentially,
    sequentialClaimError,
    claimTxHash,
    swapSubmissionStatus,
    walletConnectionError,
  } = usePermitClaiming({
    permits,
    setPermits,
    setError,
    updatePermitStatusCache,
    publicClient: publicClient ?? null,
    walletClient: walletClient ?? null,
    address,
    chain: chain ?? null,
    claimablePermits,
  });

  // --- UI Logic ---
  const toggleTableVisibility = () => {
    setIsTableVisible((prev) => !prev);
  };

  const handlePreferenceChange = useCallback((selectedAddress: Address | null) => {
    setPreferredRewardTokenAddress(selectedAddress);
    console.log("DashboardPage received preference change:", selectedAddress);
  }, []);


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
              onClick={() => handleClaimBatch(claimablePermits)}
              disabled={isClaimingSequentially || !isConnected || claimablePermitCount === 0}
              className="button-with-icon"
              title="Claim all valid and available permits (batch RPC)"
            >
              {isClaimingSequentially ? <div className="spinner button-spinner"></div> : ICONS.CLAIM}
              <span>
                {isLoading ? (
                  "Loading Rewards..."
                ) : isQuoting ? (
                  "Calculating..."
                ) : (
                  <>
                    <span className="claim-amount">{estimatedTotalValueDisplay}</span>
                    <span className="claim-count">
                      ({claimablePermitCount} Reward{claimablePermitCount !== 1 ? "s" : ""})
                    </span>
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
      {invalidationError && (
        <section id="error-message-wrapper" style={{ marginTop: "5px" }}>
          <div className="error-message">
            {ICONS.WARNING}
            <span>{invalidationError}</span>
          </div>
        </section>
      )}

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
          permits={displayablePermits}
          onClaimPermit={handleClaimPermit}
          onClaimSequential={handleClaimSequential}
          onClaimBatch={handleClaimBatch}
          onInvalidatePermit={handleInvalidatePermit}
          isConnected={isConnected}
          chain={chain}
          claimTxHash={claimTxHash}
          isLoading={isLoading}
          isQuoting={isQuoting}
          preferredRewardTokenAddress={preferredRewardTokenAddress}
          isFundingWallet={isFundingWallet}
          isInvalidating={isInvalidating}
          address={address}
        />
      )}

      {/* Reward Preference Selector Button */}
      {isConnected && <PreferredTokenSelectorButton chainId={chain?.id} onPreferenceChange={handlePreferenceChange} />}
    </>
  );
}
