import React, { useEffect, useState, useMemo } from "react"; // Added useMemo
import { useAccount, useDisconnect, useWriteContract, useWaitForTransactionReceipt, usePublicClient } from "wagmi"; // Removed useWalletClient
// Removed multicall import from @wagmi/core
import { rpcHandler } from "../main"; // Import rpcHandler, removed unused config
import { readContract } from "@pavlovcik/permit2-rpc-manager"; // Import readContract
import { type Address, type Hex, BaseError, ContractFunctionRevertedError, formatUnits, type Abi } from "viem"; // Added formatUnits, Abi
import type { PermitData } from "../../../shared/types";
import permit2ABI from "../fixtures/permit2-abi";
import { preparePermitPrerequisiteContracts, hasRequiredFields } from "../utils/permit-utils"; // Removed unused MulticallContract
// Removed multicall utility import as we send sequentially now
// import { claimMultiplePermitsViaMulticall, type MulticallPermitInput } from "../utils/multicall-utils";
import { PermitsTable } from "./permits-table";
import logoSvgContent from "../assets/ubiquity-os-logo.svg?raw";
// Removed MulticallReturnType import
import { ICONS } from "./ICONS";

// Assuming BACKEND_API_URL is accessible
const BACKEND_API_URL = import.meta.env.VITE_BACKEND_API_URL || "http://localhost:8000";
const PERMIT2_ADDRESS = "0x000000000022D473030F116dDEE9F6B43aC78BA3" as Address; // Universal Permit2 address
// MULTICALL3_ADDRESS is no longer needed for this approach
// const MULTICALL3_ADDRESS = "0xcA11bde05977b3631167028862bE2a173976CA11" as Address;

export function DashboardPage() {
  // State management
  const [permits, setPermits] = useState<PermitData[]>([]);
  const [isLoading, setIsLoading] = useState(false); // For initial data load
  const [isTableVisible, setIsTableVisible] = useState(false);
  const [initialLoadComplete, setInitialLoadComplete] = useState(false);
  const [error, setError] = useState<string | null>(null); // General dashboard error
  const [sequentialClaimError, setSequentialClaimError] = useState<string | null>(null); // Error for sequential claim process
  const [isClaimingSequentially, setIsClaimingSequentially] = useState(false); // Loading state for sequential claim button
  const [animationsApplied, setAnimationsApplied] = useState(false); // Track if initial animations ran

  // Hook for single/sequential claims (reused)
  const { data: claimTxHash, error: writeContractError, writeContractAsync, reset: resetWriteContract } = useWriteContract();

  // State for claim confirmation (reused, tracks the *latest* tx)
  const {
    data: claimReceipt,
    isLoading: isClaimConfirming,
    isSuccess: isClaimConfirmed,
    error: claimReceiptError,
  } = useWaitForTransactionReceipt({ hash: claimTxHash });

  // Wallet Connection Logic
  const { address, isConnected, chain } = useAccount();
  const { disconnect } = useDisconnect();
  const publicClient = usePublicClient(); // Get PublicClient for simulations

  // --- Calculations ---
  // Calculate valid permits for the current chain to display count and enable button
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

  // Calculate the sum of token amounts for claimable permits, assuming 18 decimals and $1 price
  const claimableTotalValue = useMemo(() => {
    const assumedDecimals = 18; // User specified assumption
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
    // Format the total sum using the assumed decimals
    try {
      return parseFloat(formatUnits(totalSumInWei, assumedDecimals));
    } catch (e) {
      console.error("Error formatting total sum:", e);
      return 0;
    }
  }, [claimablePermits]);

  // Format the value for display (assuming $1 price)
  const claimableTotalValueDisplay = useMemo(() => {
    if (claimableTotalValue > 0) {
      return `$${claimableTotalValue.toFixed(2)}`; // Format as currency
    }
    return ""; // Return empty string if value is 0
  }, [claimableTotalValue]);

  // --- Fetching Logic ---
  const fetchPermitsAndCheck = async () => {
    setIsLoading(true);
    setError(null);
    setSequentialClaimError(null); // Clear sequential claim error on fetch
    console.log("Fetching permits from backend API...");
    if (!isConnected || !address) {
      setError("Wallet not connected.");
      setIsLoading(false);
      setInitialLoadComplete(true);
      return;
    }
    let initialPermits: PermitData[] = [];
    try {
      const response = await fetch(`${BACKEND_API_URL}/api/permits?walletAddress=${address}`, { headers: { Accept: "application/json" } });
      if (!response.ok) {
        let errorMsg = `Failed to fetch permits for wallet ${address}: ${response.status} ${response.statusText}`;
        try {
          const errorData = await response.json();
          errorMsg = errorData.error || errorMsg;
        } catch {
          /* Ignore */
        }
        throw new Error(errorMsg);
      }
      const data = await response.json();
      if (!data || !Array.isArray(data.permits)) {
        throw new Error("Received invalid data format for permits.");
      }
      initialPermits = data.permits.map((p: PermitData) => ({ ...p, claimStatus: "Idle" }));
      // Removed unused permitsByNetwork variable

      // Use readContract for checks
      const checkedPermitsMap = new Map<string, Partial<PermitData>>();
      const checkPromises = initialPermits
        .filter((permit) => permit.type === "erc20-permit" && permit.token?.address && permit.amount && permit.owner && permit.networkId)
        .flatMap((permit) => {
          const calls = preparePermitPrerequisiteContracts(permit);
          if (!calls) return []; // Should not happen due to filter, but safety check

          const key = `${permit.nonce}-${permit.networkId}`;
          const requiredAmount = BigInt(permit.amount!); // Safe due to filter
          const chainId = permit.networkId!; // Safe due to filter

          const balanceCall = calls[0];
          const allowanceCall = calls[1];

          // Create promises for balance and allowance checks using readContract
          const balancePromise = readContract<bigint>({
            handler: rpcHandler,
            chainId: chainId,
            address: balanceCall.address,
            abi: balanceCall.abi as Abi, // Cast Abi
            functionName: balanceCall.functionName,
            args: balanceCall.args,
          }).then((balance) => ({ key, type: "balance", result: balance, requiredAmount }))
            .catch((error) => ({ key, type: "balance", error }));

          const allowancePromise = readContract<bigint>({
            handler: rpcHandler,
            chainId: chainId,
            address: allowanceCall.address,
            abi: allowanceCall.abi as Abi, // Cast Abi
            functionName: allowanceCall.functionName,
            args: allowanceCall.args,
          }).then((allowance) => ({ key, type: "allowance", result: allowance, requiredAmount }))
            .catch((error) => ({ key, type: "allowance", error }));

          return [balancePromise, allowancePromise];
        });

      const settledResults = await Promise.allSettled(checkPromises);

      settledResults.forEach((settledResult) => {
        if (settledResult.status === "fulfilled") {
          // Type guard to check if the promise resolved successfully or was caught
          const value = settledResult.value;
          const updateData = checkedPermitsMap.get(value.key) || {};

          if ('error' in value) {
            // Handle case where promise was caught and returned an error object
            console.warn(`Prereq check failed for permit ${value.key} (${value.type}):`, value.error);
            updateData.checkError = `Check failed (${value.type}).`;
          } else {
            // Handle successful promise resolution
            if (value.type === "balance") {
              updateData.ownerBalanceSufficient = BigInt(value.result) >= value.requiredAmount;
            } else if (value.type === "allowance") {
              updateData.permit2AllowanceSufficient = BigInt(value.result) >= value.requiredAmount;
            }
          }
          checkedPermitsMap.set(value.key, updateData);
        } else {
          // Handle case where promise itself was rejected (e.g., network error before catch)
          // We don't know the key/type here easily, log the reason
          console.error("Prereq check promise rejected:", settledResult.reason);
          // Cannot reliably update map without key/type
        }
      });
      const finalCheckedPermits = initialPermits.map((permit) => {
        const key = `${permit.nonce}-${permit.networkId}`;
        const checkData = checkedPermitsMap.get(key);
        return checkData ? { ...permit, ...checkData } : permit;
      });
      setPermits(finalCheckedPermits);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An unknown error occurred during fetch/check");
      console.error("Error in fetchPermitsAndCheck:", err);
      if (initialPermits.length > 0 && permits.length === 0) {
        setPermits(initialPermits.map((p) => ({ ...p, checkError: "Fetch failed before checks." })));
      }
    } finally {
      setIsLoading(false);
      setInitialLoadComplete(true);
    }
  };

  // Function to toggle table visibility
  const toggleTableVisibility = () => {
    setIsTableVisible((prev) => !prev);
  };

  // --- Handle Single Claim ---
  // This function is now also used by the sequential claim loop
  const handleClaimPermit = async (permitToClaim: PermitData) => {
    const permitKey = `${permitToClaim.nonce}-${permitToClaim.networkId}`;
    console.log(`Attempting to claim permit: ${permitKey}`);

    if (!isConnected || !address || !chain || !writeContractAsync) {
      setError("Wallet not connected or chain/write function missing.");
      setPermits((current) =>
        current.map((p) =>
          p.nonce === permitToClaim.nonce && p.networkId === permitToClaim.networkId ? { ...p, claimStatus: "Error", claimError: "Wallet not connected." } : p
        )
      );
      return false; // Indicate failure
    }
    if (permitToClaim.networkId !== chain.id) {
      const networkError = `Please switch wallet to the correct network (ID: ${permitToClaim.networkId})`;
      setError(networkError); // Show general error as well
      setPermits((current) =>
        current.map((p) =>
          p.nonce === permitToClaim.nonce && p.networkId === permitToClaim.networkId ? { ...p, claimStatus: "Error", claimError: networkError } : p
        )
      );
      return false; // Indicate failure
    }
    if (!hasRequiredFields(permitToClaim)) {
      const incompleteError = "Permit data is incomplete.";
      setError(incompleteError);
      setPermits((current) =>
        current.map((p) =>
          p.nonce === permitToClaim.nonce && p.networkId === permitToClaim.networkId ? { ...p, claimStatus: "Error", claimError: incompleteError } : p
        )
      );
      return false; // Indicate failure
    }
    // Re-check prerequisites just before claiming
    if (permitToClaim.type === "erc20-permit") {
      const balanceErrorMsg = `Insufficient balance: Owner (${permitToClaim.owner}) does not have enough tokens.`;
      const allowanceErrorMsg = `Insufficient allowance: Owner (${permitToClaim.owner}) has not approved Permit2 enough tokens.`;
      const checkErrorMsg = `Prerequisite check failed: ${permitToClaim.checkError}`;
      if (permitToClaim.ownerBalanceSufficient === false) {
        console.error(balanceErrorMsg);
        setPermits((current) =>
          current.map((p) =>
            p.nonce === permitToClaim.nonce && p.networkId === permitToClaim.networkId ? { ...p, claimStatus: "Error", claimError: balanceErrorMsg } : p
          )
        );
        return false;
      }
      if (permitToClaim.permit2AllowanceSufficient === false) {
        console.error(allowanceErrorMsg);
        setPermits((current) =>
          current.map((p) =>
            p.nonce === permitToClaim.nonce && p.networkId === permitToClaim.networkId ? { ...p, claimStatus: "Error", claimError: allowanceErrorMsg } : p
          )
        );
        return false;
      }
      if (permitToClaim.checkError) {
        console.error(checkErrorMsg);
        setPermits((current) =>
          current.map((p) =>
            p.nonce === permitToClaim.nonce && p.networkId === permitToClaim.networkId ? { ...p, claimStatus: "Error", claimError: checkErrorMsg } : p
          )
        );
        return false;
      }
    }

    // Reset writeContract state before new call
    resetWriteContract();

    setPermits((currentPermits) =>
      currentPermits.map((p) =>
        p.nonce === permitToClaim.nonce && p.networkId === permitToClaim.networkId
          ? { ...p, claimStatus: "Pending", claimError: undefined, transactionHash: undefined }
          : p
      )
    );

    try {
      if (permitToClaim.type !== "erc20-permit" || !permitToClaim.amount || !permitToClaim.token?.address) {
        throw new Error("Invalid ERC20 permit data.");
      }
      const permitArgs = {
        permitted: { token: permitToClaim.token.address as Address, amount: BigInt(permitToClaim.amount) },
        nonce: BigInt(permitToClaim.nonce),
        deadline: BigInt(permitToClaim.deadline),
      };
      const transferDetailsArgs = { to: permitToClaim.beneficiary as Address, requestedAmount: BigInt(permitToClaim.amount) };

      // Use writeContractAsync directly
      const txHash = await writeContractAsync({
        address: PERMIT2_ADDRESS,
        abi: permit2ABI,
        functionName: "permitTransferFrom",
        args: [permitArgs, transferDetailsArgs, permitToClaim.owner as Address, permitToClaim.signature as Hex],
      });

      console.log(`Claim transaction sent for ${permitKey}:`, txHash);
      setPermits((currentPermits) =>
        currentPermits.map((p) => (p.nonce === permitToClaim.nonce && p.networkId === permitToClaim.networkId ? { ...p, transactionHash: txHash } : p))
      );
      return true; // Indicate success (submission)
    } catch (err) {
      console.error(`Claiming failed for ${permitKey}:`, err);
      const errorMessage = err instanceof Error ? err.message : "An unknown error occurred";
      setPermits((currentPermits) =>
        currentPermits.map((p) =>
          p.nonce === permitToClaim.nonce && p.networkId === permitToClaim.networkId ? { ...p, claimStatus: "Error", claimError: errorMessage } : p
        )
      );
      return false; // Indicate failure
    }
  };

  // --- Handle Sequential Claim (All Validated) ---
  const handleClaimAllValidSequential = async () => {
    setSequentialClaimError(null);
    setIsClaimingSequentially(true);
    console.log("Attempting sequential claim: Finding all valid permits...");

    if (!publicClient || !address || !chain) {
      // Check publicClient and address
      setSequentialClaimError("Wallet not connected or client unavailable.");
      setIsClaimingSequentially(false);
      return;
    }

    // Use the pre-calculated claimablePermits based on current state
    const candidatePermits = claimablePermits;

    if (candidatePermits.length === 0) {
      setSequentialClaimError("No valid permits found on this network to claim.");
      setIsClaimingSequentially(false);
      return;
    }

    const validPermitsToClaim: PermitData[] = [];
    console.log(`Found ${candidatePermits.length} candidates. Simulating individually...`);

    for (const permit of candidatePermits) {
      // No longer limiting to 3
      // if (validPermitsToClaim.length >= 3) break;

      console.log(`  Simulating permit nonce: ${permit.nonce}...`);
      try {
        const permitArgs = {
          permitted: { token: permit.token!.address as Address, amount: BigInt(permit.amount!) },
          nonce: BigInt(permit.nonce),
          deadline: BigInt(permit.deadline),
        };
        const transferDetailsArgs = { to: permit.beneficiary as Address, requestedAmount: BigInt(permit.amount!) };

        // Simulate this single permit claim
        await publicClient.simulateContract({
          address: PERMIT2_ADDRESS,
          abi: permit2ABI,
          functionName: "permitTransferFrom",
          args: [permitArgs, transferDetailsArgs, permit.owner as Address, permit.signature as Hex],
          account: address, // Account needed for simulation context
        });

        console.log(`    Permit ${permit.nonce} simulation successful.`);
        validPermitsToClaim.push(permit);
      } catch (simError: unknown) {
        let reason = "Unknown simulation error";
        if (simError instanceof BaseError) {
          // Correctly check type before accessing cause
          const revertError = simError.walk(
            (err: unknown) => err instanceof Error && err.cause instanceof ContractFunctionRevertedError
          ) as ContractFunctionRevertedError | null;
          if (revertError) {
            reason = revertError.reason ?? revertError.shortMessage ?? simError.shortMessage;
          } else {
            reason = simError.shortMessage || simError.message;
          }
        } else if (simError instanceof Error) {
          reason = simError.message;
        }
        console.warn(`    Permit ${permit.nonce} simulation failed: ${reason}`);
        // Update state for this specific permit to show simulation failure
        setPermits((current) =>
          current.map((p) =>
            p.nonce === permit.nonce && p.networkId === permit.networkId ? { ...p, claimStatus: "Error", claimError: `Sim fail: ${reason}` } : p
          )
        );
      }
    }

    if (validPermitsToClaim.length === 0) {
      setSequentialClaimError("Could not find any permits that passed simulation.");
      setIsClaimingSequentially(false);
      return;
    }

    console.log(
      `Proceeding to claim ${validPermitsToClaim.length} validated permits sequentially:`,
      validPermitsToClaim.map((p) => p.nonce)
    );

    let successes = 0;
    let failures = 0;
    // Send transactions one by one
    for (const permit of validPermitsToClaim) {
      const success = await handleClaimPermit(permit); // Reuse single claim logic
      if (success) {
        successes++;
        // Optional: Wait for confirmation before sending the next?
        // Could add a delay or use useWaitForTransactionReceipt here if needed,
        // but for now, just fire them off.
      } else {
        failures++;
      }
      // Small delay between transactions to avoid RPC rate limits?
      // await new Promise(resolve => setTimeout(resolve, 500));
    }

    console.log(`Sequential claim process finished. Successes: ${successes}, Failures: ${failures}`);
    if (failures > 0) {
      setSequentialClaimError(`${failures} out of ${validPermitsToClaim.length} claim submissions failed. Check individual permits.`);
    }

    setIsClaimingSequentially(false);
  };

  // --- Effects for Handling Transaction Results ---

  // Effect for single/sequential claim confirmation
  // This now handles confirmations for *any* transaction sent via handleClaimPermit
  useEffect(() => {
    if (isClaimConfirmed && claimReceipt && claimTxHash) {
      console.log("Claim successful, Tx Hash:", claimTxHash);
      // Update status for the permit matching this hash
      setPermits((current) =>
        current.map((p) => (p.transactionHash === claimTxHash ? { ...p, claimStatus: "Success", status: "Claimed", claimError: undefined } : p))
      );
    }
    if (claimReceiptError && claimTxHash) {
      console.error("Claim tx failed, Tx Hash:", claimTxHash, claimReceiptError.message);
      // Update status for the permit matching this hash
      setPermits((current) =>
        current.map((p) => (p.transactionHash === claimTxHash ? { ...p, claimStatus: "Error", claimError: claimReceiptError.message } : p))
      );
    }
  }, [isClaimConfirmed, claimReceipt, claimReceiptError, claimTxHash]);

  // Effect for claim submission error (writeContractError)
  // This now handles submission errors for *any* transaction sent via handleClaimPermit
  useEffect(() => {
    if (writeContractError) {
      console.error("Claim submission failed:", writeContractError.message);
      // Find the permit that was 'Pending' but didn't get a hash assigned
      // This is imperfect if multiple are sent quickly, but best effort
      setPermits((current) =>
        current.map((p) => (p.claimStatus === "Pending" && !p.transactionHash ? { ...p, claimStatus: "Error", claimError: writeContractError.message } : p))
      );
    }
  }, [writeContractError]);

  // Fetch permits when connected
  useEffect(() => {
    if (isConnected) {
      fetchPermitsAndCheck();
    } else {
      setInitialLoadComplete(true);
      setPermits([]); // Clear permits if disconnected
    }
  }, [isConnected]);

  // Effect to apply initial animations only once on mount
  useEffect(() => {
    if (!animationsApplied) {
      const header = document.getElementById("header");
      const logoWrapper = document.getElementById("logo-wrapper");
      const controls = document.getElementById("controls");

      if (header) {
        header.classList.add("initial-fade-in");
      }
      if (logoWrapper) {
        logoWrapper.classList.add("initial-slide-in-logo");
      }
      if (controls) {
        controls.classList.add("initial-slide-in-controls");
      }

      setAnimationsApplied(true); // Mark animations as applied
    }
  }, [animationsApplied]); // Run only once after initial render

  const LogoSpan = () => <span id="header-logo-wrapper" dangerouslySetInnerHTML={{ __html: logoSvgContent }} />;

  return (
    <>
      {/* Header Section */}
      <section id="header">
        {/* Logo Wrapper (Now in the middle) */}
        <div id="logo-wrapper">
          <h1>
            <LogoSpan />
            <span>Ubiquity OS Rewards</span>
          </h1>
        </div>

        {/* Controls (Remains on the right) */}
        {isConnected && address ? ( // Check for address as well
          <div id="controls">
            <button onClick={() => disconnect()} className="button-with-icon">
              {ICONS.DISCONNECT}
              <span>{`${address.substring(0, 6)}...${address.substring(address.length - 4)}`}</span>
            </button>

            {/* Claim All Valid Sequentially Button */}
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

            {/* Container for spinner OR expand button (Moved to the left) */}
            <div className="spinner-or-expand-container">
              <button
                className="expand-button"
                disabled={!initialLoadComplete} // Only disable before initial load completes
                onClick={toggleTableVisibility}
                title={isTableVisible ? "Collapse" : "Expand"}
              >
                {isTableVisible ? ICONS.CLOSER : ICONS.OPENER}
              </button>
            </div>
          </div>
        ) : (
          // This part should ideally not be reached if App.tsx handles rendering LoginPage
          <div>Wallet not connected.</div>
        )}
      </section>

      {/* General Error Display */}
      {error && (
        <section id="error-message-wrapper">
          <div className="error-message">
            {ICONS.WARNING}
            <span>{error}</span>
          </div>
        </section>
      )}
      {/* Sequential Claim Error Display */}
      {sequentialClaimError && (
        <section id="error-message-wrapper" style={{ marginTop: "5px" }}>
          <div className="error-message">
            {ICONS.WARNING}
            <span>{sequentialClaimError}</span>
          </div>
        </section>
      )}

      {/* Permits Table (Conditionally Rendered) */}
      {isTableVisible && (
        <PermitsTable
          permits={permits}
          onClaimPermit={handleClaimPermit} // Keep single claim functionality
          isConnected={isConnected}
          chain={chain}
          // Pass correct confirmation state (tracks latest tx)
          isConfirming={isClaimConfirming}
          // Pass appropriate hash (tracks latest tx)
          confirmingHash={claimTxHash}
          isLoading={isLoading} // Pass general loading state for table skeleton/message
        />
      )}
    </>
  );
}
