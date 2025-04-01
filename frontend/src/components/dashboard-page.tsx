import { useEffect, useState, useMemo } from "react";
import { useAccount, useDisconnect } from "wagmi";
import { formatUnits } from "viem";
// Removed unused PermitData import
import { hasRequiredFields } from "../utils/permit-utils";
import { PermitsTable } from "./permits-table";
import logoSvgContent from "../assets/ubiquity-os-logo.svg?raw";
import { usePermitData } from "../hooks/use-permit-data"; // Import the data hook
import { usePermitClaiming } from "../hooks/use-permit-claiming"; // Import the claiming hook
import { ICONS } from "./iconography";
import { LogoSpan } from "./login-page";
// Removed unused imports: useWriteContract, useWaitForTransactionReceipt, usePublicClient, rpcHandler, readContract, Address, Hex, BaseError, ContractFunctionRevertedError, Abi, permit2ABI, preparePermitPrerequisiteContracts, ICONS

// Removed constants BACKEND_API_URL, PERMIT2_ADDRESS as they are now in hooks/utils

export function DashboardPage() {
  // UI State
  const [isTableVisible, setIsTableVisible] = useState(false);
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
  } = usePermitData({ address, isConnected });

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
          console.error(`Error parsing amount for permit nonce ${permit.nonce}: ${permit.amount}`, e);
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

  // Format the value for display, always showing two decimal places
  const claimableTotalValueDisplay = useMemo(() => {
    return `$${claimableTotalValue.toFixed(2)}`;
  }, [claimableTotalValue]);

  // Custom Hook for Claiming Logic
  const {
    handleClaimPermit,
    handleClaimAllValidSequential,
    isClaimingSequentially,
    sequentialClaimError,
    // setSequentialClaimError, // Only needed internally in the hook
    isClaimConfirming,
    claimTxHash,
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
                ) : (
                  <>
                    <span className="claim-amount">{claimableTotalValueDisplay}</span>
                    <span className="claim-count">
                      ({claimablePermitCount} Reward{claimablePermitCount !== 1 ? "s" : ""})
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
        />
      )}
    </>
  );
}
