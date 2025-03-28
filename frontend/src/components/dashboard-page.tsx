import React, { useEffect, useState } from "react";
import { useAccount, useConnect, useDisconnect, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
// Removed unused imports: readContract, erc20Abi, config
import { injected } from "wagmi/connectors"; // Example connector
import type { PermitData } from "../../../shared/types"; // Corrected path
import permit2ABI from "../fixtures/permit2-abi"; // Adjust path
import { checkPermitPrerequisites, hasRequiredFields } from "../utils/permit-utils"; // Import helpers (removed formatAmount)
import { PermitsTable } from "./permits-table"; // Import the new table component
import logoSvgContent from "../assets/ubiquity-os-logo.svg?raw"; // Import SVG content as raw string
import { useAuth } from "../auth-context";

// Assuming BACKEND_API_URL and PERMIT2_ADDRESS are accessible
const BACKEND_API_URL = import.meta.env.VITE_BACKEND_API_URL || "http://localhost:8000";
const PERMIT2_ADDRESS = "0x000000000022D473030F116dDEE9F6B43aC78BA3"; // Universal Permit2 address

// Removed checkPermitPrerequisites function (moved to utils)

export function DashboardPage() {
  // State management
  const [permits, setPermits] = useState<PermitData[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null); // General dashboard error
  const { data: hash, error: writeContractError, writeContractAsync } = useWriteContract(); // Removed unused isSubmitting

  // State for waiting for transaction receipt
  const { data: receipt, isLoading: isConfirming, isSuccess: isConfirmed, error: receiptError } = useWaitForTransactionReceipt({ hash });
  const { isLoggedIn, logout } = useAuth();
  const handleLogout = () => {
    logout();
  };
  // Fetch permits from backend API and check prerequisites
  const fetchPermitsAndCheck = async () => {
    setIsLoading(true);
    setError(null);
    console.log("Fetching permits from backend API...");
    const token = localStorage.getItem("sessionToken"); // Get JWT from storage
    if (!token) {
      setError("Not authenticated. Please login.");
      setIsLoading(false);
      return;
    }

    try {
      const response = await fetch(`${BACKEND_API_URL}/api/permits`, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
      });

      if (!response.ok) {
        let errorMsg = `Failed to fetch permits: ${response.status} ${response.statusText}`;
        try {
          const errorData = await response.json();
          errorMsg = errorData.error || errorMsg;
        } catch {
          /* Ignore JSON parsing error */
        }
        throw new Error(errorMsg);
      }

      const data = await response.json();
      if (!data || !Array.isArray(data.permits)) {
        console.error("Invalid permit data format received:", data);
        throw new Error("Received invalid data format for permits.");
      }

      // Use PermitData type here
      const initialPermits: PermitData[] = data.permits.map((p: PermitData) => ({ ...p, claimStatus: "Idle" }));
      console.log("Fetched permits, checking prerequisites:", initialPermits.length);

      // Check prerequisites concurrently
      const prerequisiteChecks = await Promise.allSettled(
        initialPermits.map((permit) => checkPermitPrerequisites(permit)) // Check all permits, function handles non-ERC20
      );

      // Merge results with permits
      const checkedPermits = initialPermits.map((permit, index) => {
        const checkResult = prerequisiteChecks[index];
        if (checkResult.status === "fulfilled") {
          // Add check results only if they exist (i.e., was an ERC20 check)
          return { ...permit, ...checkResult.value };
        } else {
          // Handle case where the check itself failed
          console.error(`Prerequisite check failed for permit ${permit.nonce}:`, checkResult.reason);
          return { ...permit, checkError: "Failed to perform checks." };
        }
      });

      setPermits(checkedPermits);
      console.log("Finished checking prerequisites, updated permits state.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "An unknown error occurred");
      console.error("Error fetching permits:", err);
    } finally {
      setIsLoading(false);
    }
  };

  // Wallet Connection Logic
  const { address, isConnected, isConnecting, chain } = useAccount(); // Add chain
  const { connect } = useConnect();
  const { disconnect } = useDisconnect();

  // Removed unused linkWallet function

  const handleConnectWallet = () => {
    if (!isConnecting) {
      connect({ connector: injected() });
    }
  };

  // Removed formatAmount function (moved to utils)

  // Removed hasRequiredFields function (moved to utils)

  // --- Handle Actual Claim ---
  // NOTE: This function now assumes prerequisites were checked on fetch
  const handleClaimPermit = async (permitToClaim: PermitData) => {
    console.log("Attempting to claim permit:", permitToClaim);
    if (!isConnected || !address || !chain || !writeContractAsync) {
      setError("Wallet not connected or chain/write function missing.");
      return;
    }
    if (permitToClaim.networkId !== chain.id) {
      setError(`Please switch wallet to the correct network (ID: ${permitToClaim.networkId})`);
      return;
    }
    if (!hasRequiredFields(permitToClaim)) {
      setError("Permit data is incomplete.");
      return;
    }

    // Re-check prerequisites just before sending, using stored state
    if (permitToClaim.type === "erc20-permit") {
      if (permitToClaim.ownerBalanceSufficient === false) {
        const errorMsg = `Insufficient balance: Owner (${permitToClaim.owner}) does not have enough tokens.`;
        console.error(errorMsg);
        setPermits((currentPermits) =>
          currentPermits.map((p) =>
            p.nonce === permitToClaim.nonce && p.networkId === permitToClaim.networkId ? { ...p, claimStatus: "Error", claimError: errorMsg } : p
          )
        );
        return;
      }
      if (permitToClaim.permit2AllowanceSufficient === false) {
        const errorMsg = `Insufficient allowance: Owner (${permitToClaim.owner}) has not approved Permit2 enough tokens.`;
        console.error(errorMsg);
        setPermits((currentPermits) =>
          currentPermits.map((p) =>
            p.nonce === permitToClaim.nonce && p.networkId === permitToClaim.networkId ? { ...p, claimStatus: "Error", claimError: errorMsg } : p
          )
        );
        return;
      }
      if (permitToClaim.checkError) {
        const errorMsg = `Prerequisite check failed: ${permitToClaim.checkError}`;
        console.error(errorMsg);
        setPermits((currentPermits) =>
          currentPermits.map((p) =>
            p.nonce === permitToClaim.nonce && p.networkId === permitToClaim.networkId ? { ...p, claimStatus: "Error", claimError: errorMsg } : p
          )
        );
        return;
      }
    }

    // Update UI state to Pending ONLY after checks pass
    setPermits((currentPermits) =>
      currentPermits.map((p) =>
        p.nonce === permitToClaim.nonce && p.networkId === permitToClaim.networkId ? { ...p, claimStatus: "Pending", claimError: undefined } : p
      )
    );

    try {
      // Prepare arguments for permitTransferFrom
      // Ensure amount is defined for ERC20
      if (permitToClaim.type !== "erc20-permit" || !permitToClaim.amount || !permitToClaim.token?.address) {
        throw new Error("Cannot prepare arguments: Invalid ERC20 permit data.");
      }

      const permitArgs = {
        permitted: {
          token: permitToClaim.token.address as `0x${string}`, // Cast needed
          amount: BigInt(permitToClaim.amount),
        },
        nonce: BigInt(permitToClaim.nonce),
        deadline: BigInt(permitToClaim.deadline),
      };

      const transferDetailsArgs = {
        to: permitToClaim.beneficiary as `0x${string}`, // Cast needed
        requestedAmount: BigInt(permitToClaim.amount),
      };

      console.log("Calling permitTransferFrom with args:", {
        permit: permitArgs,
        transferDetails: transferDetailsArgs,
        owner: permitToClaim.owner,
        signature: permitToClaim.signature,
      });

      // Send transaction
      const txHash = await writeContractAsync({
        address: PERMIT2_ADDRESS,
        abi: permit2ABI, // Use imported ABI
        functionName: "permitTransferFrom",
        args: [
          permitArgs,
          transferDetailsArgs,
          permitToClaim.owner as `0x${string}`, // Cast needed
          permitToClaim.signature as `0x${string}`,
        ],
      });

      console.log("Claim transaction sent:", txHash);

      // Update UI state with hash (will update fully on receipt)
      setPermits((currentPermits) =>
        currentPermits.map((p) => (p.nonce === permitToClaim.nonce && p.networkId === permitToClaim.networkId ? { ...p, transactionHash: txHash } : p))
      );
    } catch (err) {
      console.error("Claiming failed:", err);
      const errorMessage = err instanceof Error ? err.message : "An unknown error occurred";
      // Update specific permit state to error
      setPermits((currentPermits) =>
        currentPermits.map((p) =>
          p.nonce === permitToClaim.nonce && p.networkId === permitToClaim.networkId ? { ...p, claimStatus: "Error", claimError: errorMessage } : p
        )
      );
    }
  };

  // --- NEW: Effect to handle transaction confirmation ---
  useEffect(() => {
    if (isConfirmed && receipt && hash) {
      console.log("Claim transaction successful:", receipt);
      setPermits((currentPermits) =>
        currentPermits.map((p) => (p.transactionHash === hash ? { ...p, claimStatus: "Success", status: "Claimed", claimError: undefined } : p))
      );
      // Optional: Call backend to confirm status update
      // findPermitByHashAndCallUpdate(hash);
    }
    if (receiptError && hash) {
      console.error("Claim transaction failed:", receiptError);
      setPermits((currentPermits) =>
        currentPermits.map((p) => (p.transactionHash === hash ? { ...p, claimStatus: "Error", claimError: receiptError.message } : p))
      );
    }
  }, [isConfirmed, receipt, receiptError, hash]); // Dependencies for the effect

  // --- NEW: Effect to handle write contract errors ---
  useEffect(() => {
    if (writeContractError) {
      console.error("Claim submission failed:", writeContractError);
      // Find the permit that was pending and set its status to Error
      // Check if the error is already handled by the allowance check or tx confirmation effect
      const isAlreadyHandled = permits.some((p) => p.claimStatus === "Error" && p.claimError === writeContractError.message);
      if (!isAlreadyHandled) {
        setPermits((currentPermits) =>
          currentPermits.map((p) =>
            p.claimStatus === "Pending" // Assume only one can be pending from this hook instance
              ? { ...p, claimStatus: "Error", claimError: writeContractError.message }
              : p
          )
        );
      }
    }
  }, [writeContractError, permits]); // Added permits dependency

  // Fetch permits when connected
  useEffect(() => {
    if (isConnected) {
      // Only fetch if connected
      fetchPermitsAndCheck(); // Use the new function
    }
    // Optional: Clear permits if disconnected?
    // else { setPermits([]); }
  }, [isConnected]); // Re-run when isConnected changes

  // Create a wrapper span for the SVG content
  const LogoSpan = () => (
    <span
      id="header-logo-wrapper" // Use a wrapper class if needed for positioning/sizing
      dangerouslySetInnerHTML={{ __html: logoSvgContent }}
    />
  );

  return (
    <>

      <header>
        <h1>
          <LogoSpan />
          <span>Ubiquity OS Rewards</span>
        </h1>
      </header>

      {isConnected ? (
        <div id="controls">
          <button onClick={() => disconnect()} className="button-with-icon"> {/* Apply CSS class */}
          <svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="#ffffff"><path d="M431.54-140q-15.37 0-25.76-10.4-10.39-10.39-10.39-25.76v-76.92L281.08-367.39q-9.85-9.84-15.46-23.1-5.62-13.26-5.62-27.9v-169.3q0-20.64 8.89-38.71 8.88-18.06 27.19-27.52l56.23 56.23h-24.62q-3.07 0-5.38 2.69t-2.31 7.31V-414l135.38 135.38V-200h49.24v-78.62l41.23-41.23L85.54-780.16q-8.31-8.3-8.5-20.88-.19-12.58 8.5-21.27t21.07-8.69q12.39 0 21.08 8.69l693.85 693.85q8.31 8.31 8.5 20.88.19 12.58-8.5 21.27t-21.08 8.69q-12.38 0-21.07-8.69L588.61-277.08l-24 24v76.92q0 15.37-10.39 25.76-10.39 10.4-25.76 10.4h-96.92Zm242.92-248.77L640-423.23v-164.46q0-4.62-3.85-8.46-3.84-3.85-8.46-3.85H463.23l-116.3-116.3V-790q0-12.75 8.62-21.37 8.63-8.63 21.39-8.63 12.75 0 21.37 8.63 8.61 8.62 8.61 21.37v130h146.16v-130q0-12.75 8.63-21.37 8.62-8.63 21.38-8.63 12.75 0 21.37 8.63 8.61 8.62 8.61 21.37v160l-29.99-30h44.61q29.83 0 51.07 21.24Q700-617.52 700-587.69v146.54q0 13.03-4.9 24.84-4.89 11.81-13.87 20.77l-6.77 6.77ZM553-510.23Zm-120.38 77.77Z"/></svg>
            <span>Disconnect Wallet</span>
          </button>
          {isLoggedIn && (
            <button onClick={handleLogout} className="logout-button button-with-icon"> {/* Apply CSS class */}
              <svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="#ffffff"><path d="M212.31-140Q182-140 161-161q-21-21-21-51.31v-535.38Q140-778 161-799q21-21 51.31-21h238.08q12.76 0 21.38 8.62 8.61 8.61 8.61 21.38t-8.61 21.38q-8.62 8.62-21.38 8.62H212.31q-4.62 0-8.46 3.85-3.85 3.84-3.85 8.46v535.38q0 4.62 3.85 8.46 3.84 3.85 8.46 3.85h238.08q12.76 0 21.38 8.62 8.61 8.61 8.61 21.38t-8.61 21.38q-8.62 8.62-21.38 8.62H212.31Zm492.38-310H393.85q-12.77 0-21.39-8.62-8.61-8.61-8.61-21.38t8.61-21.38q8.62-8.62 21.39-8.62h310.84l-76.92-76.92q-8.31-8.31-8.5-20.27-.19-11.96 8.5-21.27 8.69-9.31 21.08-9.62 12.38-.3 21.69 9l123.77 123.77q10.84 10.85 10.84 25.31 0 14.46-10.84 25.31L670.54-330.92q-8.92 8.92-21.19 8.8-12.27-.11-21.58-9.42-8.69-9.31-8.38-21.38.3-12.08 9-20.77l76.3-76.31Z"/></svg>
              <span>Logout</span>
            </button>
          )}
        </div>
      ) : (
        <button onClick={handleConnectWallet} disabled={isConnecting}>
          {isConnecting ? "Connecting..." : "Connect Wallet"}
        </button>
      )}
      {error && <p className="error-message">Error: {error}</p>}

      {/* Render the PermitsTable component */}
      <PermitsTable
        permits={permits}
        onClaimPermit={handleClaimPermit}
        isConnected={isConnected}
        chain={chain}
        isConfirming={isConfirming}
        confirmingHash={hash} // Pass the current hash being confirmed
        isLoading={isLoading} // Pass loading state down
      />
    </>
  );
}
