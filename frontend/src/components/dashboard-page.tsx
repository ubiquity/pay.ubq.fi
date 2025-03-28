import React, { useEffect, useState } from 'react';
import { useAccount, useConnect, useDisconnect, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { injected } from 'wagmi/connectors'; // Example connector
import type { PermitData } from '../../../shared/types'; // Corrected path
import permit2ABI from '../fixtures/permit2-abi'; // Adjust path

// Assuming BACKEND_API_URL and PERMIT2_ADDRESS are accessible
const BACKEND_API_URL = import.meta.env.VITE_BACKEND_API_URL || 'http://localhost:8000';
const PERMIT2_ADDRESS = '0x000000000022D473030F116dDEE9F6B43aC78BA3'; // Universal Permit2 address

export function DashboardPage() {
  // State management
  const [permits, setPermits] = useState<PermitData[]>([]);
   const [isLoading, setIsLoading] = useState(false);
   const [error, setError] = useState<string | null>(null); // General dashboard error
   const { data: hash, error: writeContractError, writeContractAsync } = useWriteContract(); // Removed unused isSubmitting

   // State for waiting for transaction receipt
  const { data: receipt, isLoading: isConfirming, isSuccess: isConfirmed, error: receiptError } = useWaitForTransactionReceipt({ hash });

  // Fetch permits from backend API
  const fetchPermits = async () => {
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

      // Initialize claimStatus for fetched permits
      const initialPermits = data.permits.map((p: PermitData) => ({ ...p, claimStatus: 'Idle' }));
      setPermits(initialPermits);
      console.log("Fetched permits:", initialPermits);
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

  // Format amount
  const formatAmount = (weiAmount: string): string => {
    try {
      const amount = Number(BigInt(weiAmount)) / 10 ** 18;
      return amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    } catch (error) {
      console.warn("Amount formatting failed:", error);
      return '0.00';
    }
  };

  // Check if a permit has all required fields for testing/claiming
  const hasRequiredFields = (permit: PermitData): boolean => {
    const logPrefix = `Permit ${permit.nonce}:`;
    let isValid = true;
    const errors: string[] = [];

    if (!permit.nonce) errors.push("nonce");
    if (!permit.networkId) errors.push("networkId");
    if (!permit.deadline) errors.push("deadline");
    if (!permit.beneficiary) errors.push("beneficiary");
    if (!permit.owner) errors.push("owner"); // Check owner explicitly
    if (!permit.signature) errors.push("signature"); // Check signature explicitly
    if (!permit.token?.address) errors.push("token.address");

    // Type-specific checks
    if (permit.type === 'erc20-permit') {
      if (!permit.amount) errors.push("amount (for ERC20)");
    } else if (permit.type === 'erc721-permit') {
      if (permit.token_id === undefined || permit.token_id === null) errors.push("token_id (for ERC721)");
    } else {
      errors.push(`unknown type (${permit.type})`);
    }

    if (errors.length > 0) {
      console.warn(logPrefix, `Missing required fields: ${errors.join(', ')}`);
      console.warn(logPrefix, "Full Permit data:", permit); // Log full data on failure
      isValid = false;
    }

    return isValid;
  };

  // --- Handle Actual Claim ---
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

    // Update UI state to Pending
    setPermits(currentPermits =>
      currentPermits.map(p =>
        p.nonce === permitToClaim.nonce && p.networkId === permitToClaim.networkId
          ? { ...p, claimStatus: 'Pending', claimError: undefined }
          : p
      )
    );

    try {
      // Prepare arguments for permitTransferFrom
      const permitArgs = {
        permitted: {
          token: permitToClaim.token!.address, // Non-null assertion as checked in hasRequiredFields
          amount: BigInt(permitToClaim.amount!), // Non-null assertion for ERC20
        },
        nonce: BigInt(permitToClaim.nonce),
        deadline: BigInt(permitToClaim.deadline),
      };

      const transferDetailsArgs = {
        to: permitToClaim.beneficiary,
        requestedAmount: BigInt(permitToClaim.amount!), // Claim full amount
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
          permitToClaim.owner,
          permitToClaim.signature as `0x${string}`, // Cast signature to Hex type
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
      setPermits(currentPermits =>
        currentPermits.map(p =>
          p.claimStatus === 'Pending' // Assume only one can be pending from this hook instance
            ? { ...p, claimStatus: 'Error', claimError: writeContractError.message }
            : p
        )
      );
    }
   }, [writeContractError]);

   // Fetch permits when connected
   useEffect(() => {
     if (isConnected) { // Only fetch if connected
       fetchPermits();
     }
     // Optional: Clear permits if disconnected?
     // else { setPermits([]); }
   }, [isConnected]); // Re-run when isConnected changes

   return (
     <div>
      <h1>Permit Claiming App</h1>
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

      <hr />

      <h2>Your Permits</h2>
      {isLoading && <p>Loading permits...</p>}
      {error && <p style={{ color: 'red' }}>Error: {error}</p>}
      {/* Summary Info */}
      {permits.length > 0 && (
        <div style={{ marginBottom: '20px' }}>
          <p>Found {permits.length} permits total.</p>
          <p>{permits.filter(hasRequiredFields).length} permits have valid data.</p>
           {/* <p>{permits.filter(p => p.status === 'TestSuccess').length} permits passed test validation.</p> */}
           <p>{permits.filter(p => p.claimStatus === 'Success' || p.status === 'Claimed').length} permits claimed successfully.</p>
        </div>
      )}

      {permits.length > 0 ? (
        <>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ padding: '8px', borderBottom: '1px solid #ddd' }}>Type</th>
                <th style={{ padding: '8px', borderBottom: '1px solid #ddd' }}>Token/NFT Address</th>
                <th style={{ padding: '8px', borderBottom: '1px solid #ddd', textAlign: 'right' }}>Amount</th>
                <th style={{ padding: '8px', borderBottom: '1px solid #ddd' }}>Beneficiary</th>
                <th style={{ padding: '8px', borderBottom: '1px solid #ddd' }}>Status</th>
                <th style={{ padding: '8px', borderBottom: '1px solid #ddd' }}>Source</th>
                <th style={{ padding: '8px', borderBottom: '1px solid #ddd' }}>Actions</th>
              </tr>
            </thead>
             <tbody>
               {permits.map((permit) => {
                  const isReadyToClaim = hasRequiredFields(permit); // Simplified: Claimable if fields are present
                  const isClaimed = permit.claimStatus === 'Success' || permit.status === 'Claimed'; // Consider both frontend and backend status
                  const isClaimingThis = permit.claimStatus === 'Pending'; // Only check if this specific permit is pending
                  const claimFailed = permit.claimStatus === 'Error';

                 return (
                  <tr key={permit.nonce + permit.networkId} style={{
                    backgroundColor: !hasRequiredFields(permit) ? '#fff4f4' :
                                   isClaimed ? '#e6ffed' : // Light green for claimed
                                   claimFailed ? '#ffebe9' : // Light red for failed claim
                                   isClaimingThis ? '#fff9e6' : // Light yellow for claiming
                                   (permit.status === 'TestSuccess' || permit.status === 'Valid') ? '#f4fff4' : // Lighter green for tested/valid
                                   permit.status === 'TestFailed' ? '#fff4f4' : // Lighter red for failed test
                                   'transparent'
                  }}>
                    <td style={{ padding: '8px', borderBottom: '1px solid #ddd' }}>
                      {permit.amount ? 'ERC20' : 'NFT'}
                    </td>
                    <td style={{ padding: '8px', borderBottom: '1px solid #ddd', fontFamily: 'monospace', fontSize: '0.9em' }}>
                      {permit.token?.address || permit.tokenAddress || 'Missing Address'}
                      {permit.networkId && <span style={{ fontSize: '0.8em', color: '#666', marginLeft: '5px' }}>
                        ({permit.networkId === 100 ? 'WXDAI' : 'ETH'})
                      </span>}
                    </td>
                    <td style={{ padding: '8px', borderBottom: '1px solid #ddd', textAlign: 'right', fontFamily: 'monospace' }}>
                      {permit.amount ? formatAmount(permit.amount) : 'NFT'}
                    </td>
                    <td style={{ padding: '8px', borderBottom: '1px solid #ddd', fontFamily: 'monospace', fontSize: '0.9em' }}>{permit.beneficiary}</td>
                    <td style={{ padding: '8px', borderBottom: '1px solid #ddd' }}>
                      <div style={{
                        color: isClaimed ? '#1a8917' : // Green
                               claimFailed ? '#d73a49' : // Red
                               isClaimingThis ? '#b08800' : // Yellow
                               (permit.status === 'TestSuccess' || permit.status === 'Valid') ? '#1a8917' : // Green
                               permit.status === 'TestFailed' ? '#d73a49' : // Red
                               permit.status === 'Testing' ? '#b08800' : // Yellow
                               '#666', // Default gray
                       fontWeight: permit.claimStatus !== 'Idle' || permit.status === 'Claimed' || permit.status === 'TestSuccess' || permit.status === 'Valid' ? 'bold' : 'normal'
                     }}>
                       {/* Prioritize Claim Status Display */}
                       {isClaimed ? 'Claimed' :
                        isClaimingThis ? 'Claiming...' :
                        claimFailed ? 'Claim Failed' :
                        (permit.status === 'TestSuccess' || permit.status === 'Valid') ? 'Valid' : // Show 'Valid' if tested successfully
                        permit.status || 'Ready'} {/* Fallback to permit.status or 'Ready' */}
                      </div>
                    </td>
                    <td style={{ padding: '8px', borderBottom: '1px solid #ddd' }}>
                      {permit.githubCommentUrl ? (
                        <a href={permit.githubCommentUrl} target="_blank" rel="noopener noreferrer">Comment</a>
                      ) : (
                        'N/A'
                      )}
                    </td>
                    <td style={{ padding: '8px', borderBottom: '1px solid #ddd' }}>
                      {/* Claim Button Logic - Updated */}
                      <button
                        onClick={() => handleClaimPermit(permit)}
                        disabled={!isConnected || !isReadyToClaim || isClaimingThis || isClaimed} // Removed global isSubmitting check
                      >
                        {isClaimed ? 'Claimed' :
                         isClaimingThis ? 'Claiming...' :
                         claimFailed ? 'Retry Claim' : // Offer retry if failed
                         'Claim'}
                      </button>
                       {/* Display Claim Error (prioritize over testError if claiming failed) */}
                       {permit.claimError && (
                         <div style={{ color: 'red', fontSize: '0.8em', marginTop: '4px' }}>
                           Error: {permit.claimError}
                         </div>
                       )}
                       {/* Display Test Error if no claim error */}
                       {!permit.claimError && permit.testError && (
                         <div style={{ color: 'orange', fontSize: '0.8em', marginTop: '4px' }}>
                           Test Failed: {permit.testError}
                         </div>
                       )}
                       {/* Display Transaction Hash Link */}
                       {permit.transactionHash && (
                         <div style={{ fontSize: '0.8em', marginTop: '4px' }}>
                           <a
                             href={`${chain?.blockExplorers?.default.url}/tx/${permit.transactionHash}`}
                             target="_blank"
                             rel="noopener noreferrer"
                             title={permit.transactionHash} // Show full hash on hover
                           >
                             View Tx {isConfirming && permit.transactionHash === hash ? '(Confirming...)' : ''}
                           </a>
                         </div>
                       )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </>
      ) : (
        !isLoading && <p>No permits found or fetched yet.</p>
      )}
    </div>
  );
}
