import { useEffect, useState, useMemo, useCallback } from "react"; // Re-added useCallback
import { useAccount, useDisconnect } from "wagmi";
import { formatUnits, Address } from "viem"; // Add Address type
// Removed unused PermitData import
import { hasRequiredFields } from "../utils/permit-utils";
import { PermitsTable } from "./permits-table";
// Removed unused logoSvgContent import
import { usePermitData } from "../hooks/use-permit-data"; // Import the data hook
import { usePermitClaiming } from "../hooks/use-permit-claiming"; // Import the claiming hook
import { ICONS } from "./iconography";
import { LogoSpan } from "./login-page";
import { PreferredTokenSelectorButton } from "./preferred-token-selector-button"; // Import the new button component
import { getTokenInfo } from "../constants/supported-reward-tokens"; // Import token info helper
// Removed unused imports: useWriteContract, useWaitForTransactionReceipt, usePublicClient, rpcHandler, readContract, Address, Hex, BaseError, ContractFunctionRevertedError, Abi, permit2ABI, preparePermitPrerequisiteContracts, ICONS, RewardPreferenceSelector

// Removed constants BACKEND_API_URL, PERMIT2_ADDRESS as they are now in hooks/utils

export function DashboardPage() {
  // UI State
  const [isTableVisible, setIsTableVisible] = useState(false);
  // Restore state setter for preferredRewardTokenAddress
  const [preferredRewardTokenAddress, setPreferredRewardTokenAddress] = useState<Address | null>(null);
  // Removed animationsApplied state

  // Wallet Connection Logic
  const { address, isConnected, chain } = useAccount();
  const { disconnect } = useDisconnect();

  // Custom Hook for Data Fetching & Management
  const {
    permits,
    setPermits, // Needed by usePermitClaiming
    isLoading,
    // initialLoadComplete, // Removed unused state
    error: dataError,
    setError, // Get the setter from usePermitData
    fetchPermitsAndCheck,
    isWorkerInitialized, // Get the worker initialization state
    updatePermitStatusCache, // Get cache update function
    isQuoting, // Get quoting status
  } = usePermitData({
    address,
    isConnected,
    preferredRewardTokenAddress, // Pass the state
    chainId: chain?.id, // Pass the current chain ID
  });

  // --- Calculations (Depend on permits state from usePermitData) ---
  const claimablePermits = useMemo(() => {
    // Assign filter result to variable first
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
    // Explicitly return the filtered array
    return filteredPermits;
  }, [permits, chain?.id]);

  const claimablePermitCount = claimablePermits.length;

  // Calculate the sum of token amounts for claimable permits
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

  // Calculate and format the *estimated* total value based on preference
  const estimatedTotalValueDisplay = useMemo(() => {
    if (!preferredRewardTokenAddress) {
      // If no preference, show original total value (assuming USD-pegged for '$')
      return `$${claimableTotalValue.toFixed(2)}`;
    }

    const preferredTokenInfo = getTokenInfo(chain?.id, preferredRewardTokenAddress);
    if (!preferredTokenInfo) {
      // Should not happen if selector is populated correctly
      return `$${claimableTotalValue.toFixed(2)} (Unknown Pref Token)`;
    }

    let totalEstimatedValueInWei = 0n;
    const permitsToConsider = permits.filter(p => claimablePermits.some(cp => cp.nonce === p.nonce && cp.networkId === p.networkId)); // Use permits that passed claimable filter

    permitsToConsider.forEach(permit => {
      if (permit.tokenAddress?.toLowerCase() === preferredRewardTokenAddress.toLowerCase()) {
        // Add original amount if it's already the preferred token
        if (permit.amount) {
          try { totalEstimatedValueInWei += BigInt(permit.amount); } catch (e) { console.error(`Error parsing original amount for estimatedTotalValue calc: ${permit.amount}`, e); }
        }
      } else if (permit.estimatedAmountOut) {
        // Add estimated amount if quote exists
         try { totalEstimatedValueInWei += BigInt(permit.estimatedAmountOut); } catch (e) { console.error(`Error parsing estimated amount for estimatedTotalValue calc: ${permit.estimatedAmountOut}`, e); }
      }
      // Ignore permits with quote errors or no quote needed/available
    });

    try {
      const formattedValue = parseFloat(formatUnits(totalEstimatedValueInWei, preferredTokenInfo.decimals));
      // Use ~ symbol to indicate estimation
      return `≈ ${formattedValue.toFixed(2)} ${preferredTokenInfo.symbol}`;
    } catch (e) {
      console.error("Error formatting estimated total value:", e);
      return `Error (${preferredTokenInfo.symbol})`;
    }
  }, [claimableTotalValue, preferredRewardTokenAddress, chain?.id, permits, claimablePermits]); // Depends on permits for estimates

  // Custom Hook for Claiming Logic
  const {
    handleClaimPermit,
    handleClaimAllValidSequential,
    isClaimingSequentially,
    sequentialClaimError,
    // setSequentialClaimError, // Only needed internally in the hook
    isClaimConfirming,
    claimTxHash,
    swapSubmissionStatus, // Get swap status
  } = usePermitClaiming({
    permits, // Pass current permits
    setPermits, // Allow hook to update permit status
    claimablePermits, // Pass pre-calculated claimable permits
    setError: setError, // Pass the setter from usePermitData
    updatePermitStatusCache: updatePermitStatusCache, // Pass down cache update function
  });

  // --- UI Logic ---
  const toggleTableVisibility = () => {
    setIsTableVisible((prev) => !prev);
  };

  // Restore handlePreferenceChange handler
  const handlePreferenceChange = useCallback((selectedAddress: Address | null) => {
    setPreferredRewardTokenAddress(selectedAddress);
    // TODO: Trigger quote fetching/recalculation based on the new preference
    console.log("DashboardPage received preference change:", selectedAddress);
  }, []);


  // --- Effects ---

  // Fetch permits when connection status changes AND worker is ready
  useEffect(() => {
    if (isConnected && isWorkerInitialized) {
      // Check both connection and worker init status
      fetchPermitsAndCheck();
    }
    // No need for else block, usePermitData handles clearing permits on disconnect
  }, [isConnected, isWorkerInitialized, fetchPermitsAndCheck]); // Add isWorkerInitialized to dependencies

  // Removed effect for initial animations

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
            {/* Use fragment instead of #controls div */}
            <button id="disconnect" onClick={() => disconnect()} className="button-with-icon">
              {ICONS.DISCONNECT}
              <span>{`${address.substring(0, 6)}...${address.substring(address.length - 4)}`}</span>
            </button>
            {/* Claim All Button */}
            <button
              id="claim-all"
              onClick={handleClaimAllValidSequential}
              disabled={isClaimingSequentially || !isConnected || claimablePermitCount === 0}
              className="button-with-icon"
              title="Claim all valid & available permits sequentially"
            >
              {isClaimingSequentially ? <div className="spinner button-spinner"></div> : ICONS.CLAIM}
              <span>
                {isLoading ? (
                  "Loading Rewards..."
                ) : isQuoting ? (
                   "Calculating..." // Show calculating state while quoting
                ) : (
                  <>
                    <span className="claim-amount">{estimatedTotalValueDisplay}</span> {/* Use estimated value */}
                    <span className="claim-count">
                      ({claimablePermitCount} Reward{claimablePermitCount !== 1 ? "s" : ""}) {/* Count remains the same */}
                    </span>
                  </>
                )}
              </span>
            </button>
            {/* Expand/Collapse Button */}
            <div className="spinner-or-expand-container">
              {/* Show spinner based on main isLoading state, disable button while loading */}
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

      {/* Swap Status Display */}
      {Object.keys(swapSubmissionStatus).length > 0 && (
        <section id="swap-status-wrapper" style={{ marginTop: "10px" }}>
          <h3>Swap Status:</h3>
          {Object.entries(swapSubmissionStatus).map(([key, status]) => (
            <div key={key} className={`swap-status ${status.status === 'error' ? 'error-message' : status.status === 'submitted' ? 'success-message' : 'info-message'}`} style={{marginBottom: '5px', padding: '5px', border: '1px solid #ccc', borderRadius: '4px'}}>
              {status.status === 'error' && ICONS.WARNING}
              {status.status === 'submitted' && ICONS.CLAIM} {/* Use CLAIM icon as placeholder for SUCCESS */}
              {status.status === 'submitting' && <div className="spinner" style={{width: '12px', height: '12px', marginRight: '5px', display: 'inline-block'}}></div>}
              <span>{status.message}</span>
              {/* Optionally add link to CowSwap explorer using orderUid if available */}
              {/* {status.orderUid && <a href={`https://explorer.cow.fi/orders/${status.orderUid}`} target="_blank" rel="noopener noreferrer"> View Order</a>} */}
            </div>
          ))}
        </section>
      )}

      {/* Permits Table */}
      {isTableVisible && (
        <PermitsTable
          permits={permits}
          onClaimPermit={handleClaimPermit} // Pass down from usePermitClaiming
          isConnected={isConnected}
          chain={chain}
          isConfirming={isClaimConfirming} // Pass down from usePermitClaiming
          confirmingHash={claimTxHash} // Pass down from usePermitClaiming
          isLoading={isLoading} // Pass down from usePermitData
          isQuoting={isQuoting} // Pass down quoting status
          preferredRewardTokenAddress={preferredRewardTokenAddress} // Pass down preference
        />
      )}

      {/* Reward Preference Selector Button */}
      {isConnected && (
        <PreferredTokenSelectorButton
          chainId={chain?.id} // Restore chainId prop
          onPreferenceChange={handlePreferenceChange} // Restore onPreferenceChange prop
        />
      )}

    </>
  );
}
