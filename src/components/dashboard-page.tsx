import { useCallback, useEffect, useMemo, useState } from "react";
import { Address, formatUnits } from "viem";
import { useAccount, useDisconnect, usePublicClient, useSwitchChain, useWalletClient } from "wagmi";
import { NEW_PERMIT2_ADDRESS, OLD_PERMIT2_ADDRESS } from "../constants/config.ts";
import { getTokenInfo } from "../constants/supported-reward-tokens.ts";
import { usePermitClaiming } from "../hooks/use-permit-claiming.ts";
import { usePermitData } from "../hooks/use-permit-data.ts";
import { PermitData } from "../types.ts";
import { hasRequiredFields } from "../utils/permit-utils.ts";
import { ICONS } from "./iconography.tsx";
import { LogoSpan } from "./login-page.tsx";
import { PermitsTable } from "./permits-table.tsx";
import { PreferredTokenSelectorButton } from "./preferred-token-selector-button.tsx";

export function DashboardPage() {
  // UI State
  const [isTableVisible, setIsTableVisible] = useState(false);
  const [preferredRewardTokenAddress, setPreferredRewardTokenAddress] = useState<Address | null>(null);

  const [isSwitchingNetwork, setIsSwitchingNetwork] = useState({
    isSwitching: false,
    expectedNetworkId: null as number | null,
    permitsToClaim: [] as PermitData[],
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
  } = usePermitData({
    address,
    isConnected,
    preferredRewardTokenAddress,
    chainId: chain?.id,
  });

  // --- Calculations (Depend on permits state from usePermitData) ---
  const claimablePermits = useMemo(() => {
    const availableClaimAmount = new Map(Array.from(balancesAndAllowances.entries()).map(([key, value]) => [key, value.maxClaimable]));
    const filteredPermits = permits
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
  }, [permits, balancesAndAllowances]);

  const claimablePermitCount = claimablePermits.length;

  const claimableTotalValue = useMemo(() => {
    const assumedDecimals = 18;
    let totalSumInWei = 0n;
    for (const permit of claimablePermits) {
      if (permit.amount) {
        try {
          totalSumInWei += permit.amount;
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
    });

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
            setIsSwitchingNetwork({ isSwitching: true, expectedNetworkId: networkId, permitsToClaim });
            await switchChainAsync({ chainId: networkId });
            return;
          }

          setPermits((prev) => prev.map((p) => (permitsForNetwork.some((c) => c.signature === p.signature) ? { ...p, claimStatus: "Pending" } : p)));
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
    [isConnected, address, chain, switchChainAsync, setPermits, handleClaimBatch, handleClaimSequential]
  );

  useEffect(() => {
    if (isConnected && walletClient && chain && isSwitchingNetwork.isSwitching && chain.id === isSwitchingNetwork.expectedNetworkId) {
      console.log(`Switched to expected network: ${chain.id}`);
      const permitsToResume = claimablePermits.filter((p) => isSwitchingNetwork.permitsToClaim.some((c) => c.signature === p.signature));
      setIsSwitchingNetwork({ isSwitching: false, expectedNetworkId: null, permitsToClaim: [] });
      void claimPermits(permitsToResume).catch((error) => {
        console.error("Failed to resume claim flow after network switch:", error);
      });
    }
  }, [isConnected, walletClient, chain, isSwitchingNetwork, claimPermits, claimablePermits]);

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
              onClick={() =>
                void claimPermits(claimablePermits).catch((error) => {
                  console.error("Failed to start claim flow:", error);
                })
              }
              disabled={isClaiming || !isConnected || claimablePermitCount === 0}
              className="button-with-icon"
              title="Claim all valid and available permits (batch RPC)"
            >
              {isClaiming ? <div className="spinner button-spinner"></div> : ICONS.CLAIM}
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
          isConnected={isConnected}
          chain={chain}
          isLoading={isLoading}
          isQuoting={isQuoting}
          preferredRewardTokenAddress={preferredRewardTokenAddress}
        />
      )}

      {/* Reward Preference Selector Button */}
      {isConnected && <PreferredTokenSelectorButton chainId={chain?.id} onPreferenceChange={handlePreferenceChange} />}
    </>
  );
}
