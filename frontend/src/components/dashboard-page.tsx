import React, { useEffect, useState } from 'react';
import { useAccount, useConnect, useDisconnect, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
// Removed unused imports: readContract, erc20Abi, config
import { injected } from 'wagmi/connectors'; // Example connector
import type { PermitData } from '../../../shared/types'; // Corrected path
import permit2ABI from '../fixtures/permit2-abi'; // Adjust path
import { checkPermitPrerequisites, hasRequiredFields } from '../utils/permit-utils'; // Import helpers (removed formatAmount)
import { PermitsTable } from './permits-table'; // Import the new table component
import logoSvgContent from '../assets/ubiquity-os-logo.svg?raw'; // Import SVG content as raw string

// Assuming BACKEND_API_URL and PERMIT2_ADDRESS are accessible
const BACKEND_API_URL = import.meta.env.VITE_BACKEND_API_URL || 'http://localhost:8000';
const PERMIT2_ADDRESS = '0x000000000022D473030F116dDEE9F6B43aC78BA3'; // Universal Permit2 address

// Removed checkPermitPrerequisites function (moved to utils)

export function DashboardPage() {
  // State management
  const [permits, setPermits] = useState<PermitData[]>([]);
   const [isLoading, setIsLoading] = useState(false);
   const [error, setError] = useState<string | null>(null); // General dashboard error
   const { data: hash, error: writeContractError, writeContractAsync } = useWriteContract(); // Removed unused isSubmitting

   // State for waiting for transaction receipt
  const { data: receipt, isLoading: isConfirming, isSuccess: isConfirmed, error: receiptError } = useWaitForTransactionReceipt({ hash });

  // Fetch permits from backend API and check prerequisites
  const fetchPermitsAndCheck = async () => {
    setIsLoading(true);
    setError(null);
    console.log("Fetching permits from backend API...");
    const token = localStorage.getItem('sessionToken'); // Get JWT from storage
    if (!token) {
      setError("Not authenticated. Please login.");
      setIsLoading(false);
      return;
    }

    try {
      const response = await fetch(`${BACKEND_API_URL}/api/permits`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/json',
        }
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
      const initialPermits: PermitData[] = data.permits.map((p: PermitData) => ({ ...p, claimStatus: 'Idle' }));
      console.log("Fetched permits, checking prerequisites:", initialPermits.length);

      // Check prerequisites concurrently
      const prerequisiteChecks = await Promise.allSettled(
          initialPermits.map(permit => checkPermitPrerequisites(permit)) // Check all permits, function handles non-ERC20
      );

      // Merge results with permits
      const checkedPermits = initialPermits.map((permit, index) => {
          const checkResult = prerequisiteChecks[index];
          if (checkResult.status === 'fulfilled') {
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
      setError(err instanceof Error ? err.message : 'An unknown error occurred');
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
    if (permitToClaim.type === 'erc20-permit') {
        if (permitToClaim.ownerBalanceSufficient === false) {
             const errorMsg = `Insufficient balance: Owner (${permitToClaim.owner}) does not have enough tokens.`;
             console.error(errorMsg);
             setPermits(currentPermits => currentPermits.map(p => p.nonce === permitToClaim.nonce && p.networkId === permitToClaim.networkId ? { ...p, claimStatus: 'Error', claimError: errorMsg } : p));
             return;
        }
        if (permitToClaim.permit2AllowanceSufficient === false) {
             const errorMsg = `Insufficient allowance: Owner (${permitToClaim.owner}) has not approved Permit2 enough tokens.`;
             console.error(errorMsg);
             setPermits(currentPermits => currentPermits.map(p => p.nonce === permitToClaim.nonce && p.networkId === permitToClaim.networkId ? { ...p, claimStatus: 'Error', claimError: errorMsg } : p));
             return;
        }
         if (permitToClaim.checkError) {
             const errorMsg = `Prerequisite check failed: ${permitToClaim.checkError}`;
             console.error(errorMsg);
             setPermits(currentPermits => currentPermits.map(p => p.nonce === permitToClaim.nonce && p.networkId === permitToClaim.networkId ? { ...p, claimStatus: 'Error', claimError: errorMsg } : p));
             return;
         }
    }


    // Update UI state to Pending ONLY after checks pass
    setPermits(currentPermits =>
      currentPermits.map(p =>
        p.nonce === permitToClaim.nonce && p.networkId === permitToClaim.networkId
          ? { ...p, claimStatus: 'Pending', claimError: undefined }
          : p
      )
    );

    try {
      // Prepare arguments for permitTransferFrom
       // Ensure amount is defined for ERC20
       if (permitToClaim.type !== 'erc20-permit' || !permitToClaim.amount || !permitToClaim.token?.address) {
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
        functionName: 'permitTransferFrom',
        args: [
          permitArgs,
          transferDetailsArgs,
          permitToClaim.owner as `0x${string}`, // Cast needed
          permitToClaim.signature as `0x${string}`,
        ],
      });

      console.log("Claim transaction sent:", txHash);

      // Update UI state with hash (will update fully on receipt)
      setPermits(currentPermits =>
        currentPermits.map(p =>
          p.nonce === permitToClaim.nonce && p.networkId === permitToClaim.networkId
            ? { ...p, transactionHash: txHash }
            : p
        )
      );

    } catch (err) {
      console.error("Claiming failed:", err);
      const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred';
      // Update specific permit state to error
      setPermits(currentPermits =>
        currentPermits.map(p =>
          p.nonce === permitToClaim.nonce && p.networkId === permitToClaim.networkId
            ? { ...p, claimStatus: 'Error', claimError: errorMessage }
            : p
        )
      );
    }
  };

  // --- NEW: Effect to handle transaction confirmation ---
  useEffect(() => {
    if (isConfirmed && receipt && hash) {
      console.log("Claim transaction successful:", receipt);
      setPermits(currentPermits =>
        currentPermits.map(p =>
          p.transactionHash === hash
            ? { ...p, claimStatus: 'Success', status: 'Claimed', claimError: undefined }
            : p
        )
      );
      // Optional: Call backend to confirm status update
      // findPermitByHashAndCallUpdate(hash);
    }
    if (receiptError && hash) {
       console.error("Claim transaction failed:", receiptError);
       setPermits(currentPermits =>
         currentPermits.map(p =>
           p.transactionHash === hash
             ? { ...p, claimStatus: 'Error', claimError: receiptError.message }
             : p
         )
       );
    }
  }, [isConfirmed, receipt, receiptError, hash]); // Dependencies for the effect

  // --- NEW: Effect to handle write contract errors ---
   useEffect(() => {
    if (writeContractError) {
      console.error("Claim submission failed:", writeContractError);
      // Find the permit that was pending and set its status to Error
      // Check if the error is already handled by the allowance check or tx confirmation effect
      const isAlreadyHandled = permits.some(p => p.claimStatus === 'Error' && p.claimError === writeContractError.message);
      if (!isAlreadyHandled) {
          setPermits(currentPermits =>
            currentPermits.map(p =>
              p.claimStatus === 'Pending' // Assume only one can be pending from this hook instance
                ? { ...p, claimStatus: 'Error', claimError: writeContractError.message }
                : p
            )
          );
      }
    }
   }, [writeContractError, permits]); // Added permits dependency

   // Fetch permits when connected
   useEffect(() => {
     if (isConnected) { // Only fetch if connected
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
     <div>
      <h1><LogoSpan />Ubiquity OS Rewards</h1>
      <p>Welcome!</p>

      {isConnected ? (
        <div>
          <p>Connected: {address} (Chain: {chain?.name ?? 'Unknown'})</p>
          <button onClick={() => disconnect()}>Disconnect Wallet</button>
        </div>
      ) : (
        <button onClick={handleConnectWallet} disabled={isConnecting}>
            {isConnecting ? 'Connecting...' : 'Connect Wallet'}
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
      />
    </div>
  );
}
