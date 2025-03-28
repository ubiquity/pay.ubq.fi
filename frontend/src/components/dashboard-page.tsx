import React, { useEffect, useState } from 'react';
import { useAccount, useConnect, useDisconnect, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { readContract } from '@wagmi/core'; // Import readContract
import { erc20Abi } from 'viem'; // Import erc20Abi for allowance check
import { config } from '../main'; // Assuming config is exported from main.tsx
import { injected } from 'wagmi/connectors'; // Example connector
import type { PermitData } from '../../../shared/types'; // Corrected path
import permit2ABI from '../fixtures/permit2-abi'; // Adjust path

// Assuming BACKEND_API_URL and PERMIT2_ADDRESS are accessible
const BACKEND_API_URL = import.meta.env.VITE_BACKEND_API_URL || 'http://localhost:8000';
const PERMIT2_ADDRESS = '0x000000000022D473030F116dDEE9F6B43aC78BA3'; // Universal Permit2 address

// Function to check owner balance and Permit2 allowance for an ERC20 permit
async function checkPermitPrerequisites(permit: PermitData): Promise<{ ownerBalanceSufficient?: boolean; permit2AllowanceSufficient?: boolean; checkError?: string }> {
  if (permit.type !== 'erc20-permit' || !permit.token?.address || !permit.amount) {
    // Don't treat this as an error, just return empty for non-applicable permits
    return {};
  }

  try {
    const requiredAmount = BigInt(permit.amount);
    const ownerAddress = permit.owner as `0x${string}`;
    const tokenAddress = permit.token.address as `0x${string}`;
    const networkId = permit.networkId as (1 | 100); // Cast for config

    // Check balance
    const balance = await readContract(config, {
      abi: erc20Abi,
      address: tokenAddress,
      functionName: 'balanceOf',
      args: [ownerAddress],
      chainId: networkId,
    });
    const ownerBalanceSufficient = BigInt(balance) >= requiredAmount;

    // Check allowance
    const allowance = await readContract(config, {
      abi: erc20Abi,
      address: tokenAddress,
      functionName: 'allowance',
      args: [ownerAddress, PERMIT2_ADDRESS],
      chainId: networkId,
    });
    const permit2AllowanceSufficient = BigInt(allowance) >= requiredAmount;

    console.log(`Prereq check for nonce ${permit.nonce}: Balance OK: ${ownerBalanceSufficient}, Allowance OK: ${permit2AllowanceSufficient}`);
    return { ownerBalanceSufficient, permit2AllowanceSufficient };

  } catch (error) {
    console.error(`Failed prerequisite check for nonce ${permit.nonce}:`, error);
    return { checkError: error instanceof Error ? error.message : "Failed to check balance/allowance." };
  }
}


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
    // Ensure token address exists for ERC20 check
    if (!permit.token?.address && permit.type === 'erc20-permit') errors.push("token.address");

    // Type-specific checks
    if (permit.type === 'erc20-permit') {
      if (!permit.amount) errors.push("amount (for ERC20)");
      if (!permit.token?.address) errors.push("token.address (for ERC20)"); // Redundant but safe
    } else if (permit.type === 'erc721-permit') {
      // ERC721 might not need token.address if tokenAddress is present, adjust if needed
      if (!permit.tokenAddress && !permit.token?.address) errors.push("token address (for ERC721)");
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
                  // Check prerequisite results
                  const insufficientBalance = permit.ownerBalanceSufficient === false;
                  const insufficientAllowance = permit.permit2AllowanceSufficient === false;
                  const prerequisiteCheckFailed = !!permit.checkError;
                  // Determine if a claim can be attempted (all checks must pass or not be applicable)
                  const canAttemptClaim = isReadyToClaim && !isClaimingThis && !isClaimed &&
                                          (permit.type !== 'erc20-permit' || (!insufficientBalance && !insufficientAllowance && !prerequisiteCheckFailed));


                 return (
                  <tr key={permit.nonce + permit.networkId} style={{
                    backgroundColor: !hasRequiredFields(permit) ? '#fff4f4' : // Invalid fields
                                   isClaimed ? '#e6ffed' : // Claimed
                                   claimFailed ? '#ffebe9' : // Claim failed
                                   isClaimingThis ? '#fff9e6' : // Claiming
                                   (insufficientBalance || insufficientAllowance || prerequisiteCheckFailed) ? '#fff4f4' : // Prerequisite failed (light red)
                                   (permit.status === 'TestSuccess' || permit.status === 'Valid') ? '#f4fff4' : // Tested/Valid
                                   permit.status === 'TestFailed' ? '#fff4f4' : // Test failed
                                   'transparent' // Default
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
                               (insufficientBalance || insufficientAllowance || prerequisiteCheckFailed) ? '#d73a49' : // Red for prereq fail
                               (permit.status === 'TestSuccess' || permit.status === 'Valid') ? '#1a8917' : // Green
                               permit.status === 'TestFailed' ? '#d73a49' : // Red
                               permit.status === 'Testing' ? '#b08800' : // Yellow
                               '#666', // Default gray
                       fontWeight: permit.claimStatus !== 'Idle' || permit.status === 'Claimed' || permit.status === 'TestSuccess' || permit.status === 'Valid' || insufficientBalance || insufficientAllowance || prerequisiteCheckFailed ? 'bold' : 'normal'
                     }}>
                       {/* Prioritize Claim Status Display */}
                       {isClaimed ? 'Claimed' :
                        isClaimingThis ? 'Claiming...' :
                        claimFailed ? 'Claim Failed' :
                        insufficientBalance ? 'Owner Balance Low' :
                        insufficientAllowance ? 'Permit2 Allowance Low' :
                        prerequisiteCheckFailed ? 'Check Failed' :
                        (permit.status === 'TestSuccess' || permit.status === 'Valid') ? 'Valid' : // Show 'Valid' if tested successfully
                        permit.status || 'Ready'} {/* Fallback to permit.status or 'Ready' */}
                      </div>
                       {/* Display Prerequisite Check Error */}
                       {permit.checkError && !permit.claimError && ( // Show check error if no claim error
                         <div style={{ color: 'red', fontSize: '0.8em', marginTop: '4px' }}>
                           Check Error: {permit.checkError}
                         </div>
                       )}
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
                        // Disable if not connected, cannot attempt claim, claiming, or claimed
                        disabled={!isConnected || !canAttemptClaim || isClaimingThis || isClaimed}
                      >
                        {isClaimed ? 'Claimed' :
                         isClaimingThis ? 'Claiming...' :
                         claimFailed ? 'Retry Claim' : // Offer retry if failed
                         (insufficientBalance || insufficientAllowance || prerequisiteCheckFailed) ? 'Cannot Claim' : // Indicate why disabled
                         'Claim'}
                      </button>
                       {/* Display Claim Error (prioritize over testError if claiming failed) */}
                       {permit.claimError && (
                         <div style={{ color: 'red', fontSize: '0.8em', marginTop: '4px' }}>
                           Error: {permit.claimError}
                         </div>
                       )}
                       {/* Display Test Error if no claim/check error */}
                       {!permit.claimError && !permit.checkError && permit.testError && (
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
