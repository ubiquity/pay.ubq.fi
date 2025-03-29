import React, { useEffect, useState, useMemo } from "react";
import { useAccount, useDisconnect } from "wagmi";
import { formatUnits } from "viem";
// Removed unused PermitData import
import { hasRequiredFields } from "../utils/permit-utils";
import { PermitsTable } from "./permits-table";
import logoSvgContent from "../assets/ubiquity-os-logo.svg?raw";
import { usePermitData } from "../hooks/use-permit-data"; // Import the data hook
import { usePermitClaiming } from "../hooks/use-permit-claiming"; // Import the claiming hook
// Removed unused imports: useWriteContract, useWaitForTransactionReceipt, usePublicClient, rpcHandler, readContract, Address, Hex, BaseError, ContractFunctionRevertedError, Abi, permit2ABI, preparePermitPrerequisiteContracts, ICONS

// Removed constants BACKEND_API_URL, PERMIT2_ADDRESS as they are now in hooks/utils

export function DashboardPage() {
  // UI State
  const [isTableVisible, setIsTableVisible] = useState(false);
  const [animationsApplied, setAnimationsApplied] = useState(false);

  // Wallet Connection Logic
  const { address, isConnected, chain } = useAccount();
  const { disconnect } = useDisconnect();

  // Custom Hook for Data Fetching & Management
  const {
    permits,
    setPermits, // Needed by usePermitClaiming
    isLoading,
    initialLoadComplete,
    error: dataError,
    setError, // Get the setter from usePermitData
    fetchPermitsAndCheck,
  } = usePermitData({ address, isConnected });

  // --- Calculations (Depend on permits state from usePermitData) ---
  const claimablePermits = useMemo(() => {
    return permits.filter(
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

  // Format the value for display
  const claimableTotalValueDisplay = useMemo(() => {
    if (claimableTotalValue > 0) {
      return `$${claimableTotalValue.toFixed(2)}`;
    }
    return "";
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
  });

  // --- UI Logic ---
  const toggleTableVisibility = () => {
    setIsTableVisible((prev) => !prev);
  };

  // --- Effects ---

  // Fetch permits when connection status changes
  useEffect(() => {
    if (isConnected) {
      fetchPermitsAndCheck();
    }
    // No need for else block, usePermitData handles clearing permits on disconnect
  }, [isConnected, fetchPermitsAndCheck]);

  // Effect for initial animations
  useEffect(() => {
    if (!animationsApplied) {
      const header = document.getElementById("header");
      const logoWrapper = document.getElementById("logo-wrapper");
      const controls = document.getElementById("controls");

      if (header) header.classList.add("initial-fade-in");
      if (logoWrapper) logoWrapper.classList.add("initial-slide-in-logo");
      if (controls) controls.classList.add("initial-slide-in-controls");

      setAnimationsApplied(true);
    }
  }, [animationsApplied]);

  // --- Rendering ---
  const LogoSpan = () => <span id="header-logo-wrapper" dangerouslySetInnerHTML={{ __html: logoSvgContent }} />;

  // Define ICONS locally or import if needed elsewhere
  const ICONS = {
    DISCONNECT: (
      <svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="#ffffff">
        <path d="M431.54-140q-15.37 0-25.76-10.4-10.39-10.39-10.39-25.76v-76.92L281.08-367.39q-9.85-9.84-15.46-23.1-5.62-13.26-5.62-27.9v-169.3q0-20.64 8.89-38.71 8.88-18.06 27.19-27.52l56.23 56.23h-24.62q-3.07 0-5.38 2.69t-2.31 7.31V-414l135.38 135.38V-200h49.24v-78.62l41.23-41.23L85.54-780.16q-8.31-8.3-8.5-20.88-.19-12.58 8.5-21.27t21.07-8.69q12.39 0 21.08 8.69l693.85 693.85q8.31 8.31 8.5 20.88.19 12.58-8.5 21.27t-21.08 8.69q-12.38 0-21.07-8.69L588.61-277.08l-24 24v76.92q0 15.37-10.39 25.76-10.39 10.4-25.76 10.4h-96.92Zm242.92-248.77L640-423.23v-164.46q0-4.62-3.85-8.46-3.84-3.85-8.46-3.85H463.23l-116.3-116.3V-790q0-12.75 8.62-21.37 8.63-8.63 21.39-8.63 12.75 0 21.37 8.63 8.61 8.62 8.61 21.37v130h146.16v-130q0-12.75 8.63-21.37 8.62-8.63 21.38-8.63 12.75 0 21.37 8.63 8.61 8.62 8.61 21.37v160l-29.99-30h44.61q29.83 0 51.07 21.24Q700-617.52 700-587.69v146.54q0 13.03-4.9 24.84-4.89 11.81-13.87 20.77l-6.77 6.77ZM553-510.23Zm-120.38 77.77Z" />
      </svg>
    ),
    CLAIM: (
      <svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="currentColor">
        <path d="M252.309-180.001q-30.308 0-51.308-21t-21-51.308V-360H240v107.691q0 4.616 3.846 8.463 3.847 3.846 8.463 3.846h455.382q4.616 0 8.463-3.846 3.846-3.847 3.846-8.463V-360h59.999v107.691q0 30.308-21 51.308t-51.308 21H252.309ZM480-335.386 309.233-506.153l42.153-43.383 98.615 98.615v-336.001h59.998v336.001l98.615-98.615 42.153 43.383L480-335.386Z"></path>
      </svg>
    ),
    OPENER: (
      <svg className="opener" xmlns="http://www.w3.org/2000/svg" height="24" viewBox="0 -960 960 960" width="24">
        <path d="M480-134.616 313.078-301.539l43.383-43.383L480-221.384l123.539-123.538 43.383 43.383L480-134.616Zm-123.539-478L313.078-656 480-822.922 646.922-656l-43.383 43.384L480-736.155 356.461-612.616Z"></path>
      </svg>
    ),
    CLOSER: (
      <svg className="closer" xmlns="http://www.w3.org/2000/svg" height="24" viewBox="0 -960 960 960" width="24">
        <path d="M356-173.847 313.847-216 480-382.153 646.153-216 604-173.847l-124-124-124 124Zm124-404L313.847-744 356-786.153l124 124 124-124L646.153-744 480-577.847Z"></path>
      </svg>
    ),
    WARNING: (
      <svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="#ffffff">
        <path d="M137.02-140q-10.17 0-18.27-4.97t-12.59-13.11q-4.68-8.08-5.15-17.5-.47-9.42 5.08-18.66l342.43-591.52q5.56-9.24 13.9-13.66 8.35-4.42 17.58-4.42 9.23 0 17.58 4.42 8.34 4.42 13.9 13.66l342.43 591.52q5.55 9.24 5.08 18.66-.47 9.42-5.15 17.5-4.49 8.14-12.59 13.11-8.1 4.97-18.27 4.97H137.02ZM178-200h604L480-720 178-200Zm302-47.69q13.73 0 23.02-9.29t9.29-23.02q0-13.73-9.29-23.02T480-312.31q-13.73 0-23.02 9.29T447.69-280q0 13.73 9.29 23.02t23.02 9.29Zm.01-104.62q12.76 0 21.37-8.62 8.62-8.63 8.62-21.38v-140q0-12.75-8.63-21.37-8.63-8.63-21.38-8.63-12.76 0-21.37 8.63-8.62 8.62-8.62 21.37v140q0 12.75 8.63 21.38 8.63 8.62 21.38 8.62ZM480-460Z" />
      </svg>
    ),
  };

  return (
    <>
      {/* Header Section */}
      <section id="header">
        <div id="logo-wrapper">
          <h1>
            <LogoSpan />
            <span>Ubiquity OS Rewards</span>
          </h1>
        </div>

        {/* Controls */}
        {isConnected && address ? (
          <div id="controls">
            <button onClick={() => disconnect()} className="button-with-icon">
              {ICONS.DISCONNECT}
              <span>{`${address.substring(0, 6)}...${address.substring(address.length - 4)}`}</span>
            </button>

            {/* Claim All Button */}
            <button
              onClick={handleClaimAllValidSequential}
              disabled={isClaimingSequentially || !isConnected || claimablePermitCount === 0}
              className="button-with-icon"
              title="Claim all valid & available permits sequentially"
            >
              {isClaimingSequentially ? <div className="spinner button-spinner"></div> : ICONS.CLAIM}
              <span>
                {isLoading
                  ? "Loading Rewards..."
                  : `${claimableTotalValueDisplay ? `${claimableTotalValueDisplay} ` : "All "} (${claimablePermitCount} Reward${
                      claimablePermitCount !== 1 ? "s" : ""
                    })`}
              </span>
            </button>

            {/* Expand/Collapse Button */}
            <div className="spinner-or-expand-container">
              <button
                className="expand-button"
                disabled={!initialLoadComplete}
                onClick={toggleTableVisibility}
                title={isTableVisible ? "Collapse" : "Expand"}
              >
                {isTableVisible ? ICONS.CLOSER : ICONS.OPENER}
              </button>
            </div>
          </div>
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
