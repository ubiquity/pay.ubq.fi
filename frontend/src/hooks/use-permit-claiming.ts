import { useState, useEffect, useCallback } from "react";
import { useWriteContract, useWaitForTransactionReceipt, usePublicClient, useAccount, useWalletClient } from "wagmi"; // Add useWalletClient
import { type Address, type Hex, BaseError, ContractFunctionRevertedError, UserRejectedRequestError } from "viem";
import type { PermitData } from "../types";
import permit2ABI from "../fixtures/permit2-abi";
import { hasRequiredFields } from "../utils/permit-utils";
import { initiateCowSwap } from "../utils/cowswap-utils"; // Import swap function
import { getTokenInfo } from "../constants/supported-reward-tokens"; // Import token info helper

const PERMIT2_ADDRESS = "0x000000000022D473030F116dDEE9F6B43aC78BA3" as Address;

interface UsePermitClaimingProps {
  permits: PermitData[]; // Keep permits for finding the right one in error handlers
  setPermits: React.Dispatch<React.SetStateAction<PermitData[]>>;
  claimablePermits: PermitData[]; // Pass pre-filtered claimable permits
  setError: React.Dispatch<React.SetStateAction<string | null>>; // To set general errors
  updatePermitStatusCache: (permitKey: string, status: Partial<CachedPermitStatus>) => void; // Add cache update function
}

// Type for cached status (consider sharing types later)
type CachedPermitStatus = Pick<PermitData, "isNonceUsed" | "checkError" | "ownerBalanceSufficient" | "permit2AllowanceSufficient">;

// Helper type guard for errors with a potential 'code' property
interface MaybeCodedError {
  code?: number | string;
  message?: string;
  cause?: unknown;
}

function isMaybeCodedError(e: unknown): e is MaybeCodedError {
  return typeof e === 'object' && e !== null;
}

// Helper to check for user rejection errors
function isUserRejection(error: unknown): boolean {
  if (error instanceof UserRejectedRequestError) {
    return true;
  }
  // Recursively check causes for common codes or messages
  let cause = isMaybeCodedError(error) ? error.cause : undefined;
  while (cause) {
    if (isMaybeCodedError(cause)) {
        if (cause.code === 4001 || cause.code === "ACTION_REJECTED") {
          return true;
        }
        if (typeof cause.message === "string" && (cause.message.includes("User rejected") || cause.message.includes("denied transaction signature"))) {
          return true;
        }
        cause = cause.cause; // Move to the next cause in the chain
    } else {
        break; // Stop if the cause is not an object we can inspect
    }
  }
  // Check top-level message as fallback
  if (isMaybeCodedError(error) && typeof error.message === "string" && (error.message.includes("User rejected") || error.message.includes("denied transaction signature"))) {
    return true;
  }
  return false;
}

// Helper to check for nonce already used errors (more robust, targeting specific log structure)
function isNonceUsedError(error: unknown): boolean {
  let currentError = error;
  let depth = 0;
  const maxDepth = 10; // Prevent infinite loops

  while (currentError && depth < maxDepth) {
    // Check 1: Direct ContractFunctionRevertedError with specific reason
    if (currentError instanceof ContractFunctionRevertedError) {
      const reason = currentError.reason?.toLowerCase();
      if (reason && (reason.includes("invalid nonce") || reason.includes("nonce already used"))) {
        // console.log("Nonce error detected via direct revert reason:", reason);
        return true;
      }
    }

    // Check 2: BaseError walk for nested ContractFunctionRevertedError
    if (currentError instanceof BaseError) {
        const nestedRevert = currentError.walk(e => e instanceof ContractFunctionRevertedError);
        if (nestedRevert instanceof ContractFunctionRevertedError) {
            const reason = nestedRevert.reason?.toLowerCase();
             if (reason && (reason.includes("invalid nonce") || reason.includes("nonce already used"))) {
                // console.log("Nonce error detected via nested revert reason:", reason);
                return true;
            }
        }
    }

    // Check 3: Check message strings for common nonce errors
    if (isMaybeCodedError(currentError) && typeof currentError.message === 'string') {
      const message = currentError.message.toLowerCase();
      if (message.includes("invalid nonce") || message.includes("nonce already used") || message.includes("nonce too low")) {
         // console.log("Nonce error detected via message keyword:", message);
         return true;
      }
    }

    // Check 4: Specifically check for the nested "VM execution error" within details, as seen in logs
    // This often masks the underlying nonce revert from Permit2 during simulation via RPC.
    if (currentError instanceof BaseError && 'details' in currentError && typeof currentError.details === 'string') {
        const details = currentError.details.toLowerCase();
        if (details.includes("vm execution error")) {
             // console.log("Nonce error potentially detected via 'VM execution error' in details.");
             return true; // Treat VM execution error during simulation as likely nonce issue
        }
     }

    // Move to the next cause
    currentError = isMaybeCodedError(currentError) ? currentError.cause : undefined;
    depth++;
  }

  // console.log("Nonce error not detected in error chain:", error);
  return false;
}


export function usePermitClaiming({ permits, setPermits, claimablePermits, setError, updatePermitStatusCache }: UsePermitClaimingProps) {
  const [sequentialClaimError, setSequentialClaimError] = useState<string | null>(null);
  const [isClaimingSequentially, setIsClaimingSequentially] = useState(false);
  const [swapSubmissionStatus, setSwapSubmissionStatus] = useState<Record<string, { status: 'submitting' | 'submitted' | 'error'; message?: string; orderUid?: string }>>({}); // State for swap feedback

  // Wallet and client hooks
  const { address, isConnected, chain } = useAccount();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient(); // Get wallet client for signing swaps

  // Wagmi hooks for writing contract and waiting for receipt
  const { data: claimTxHash, error: writeContractError, writeContractAsync, reset: resetWriteContract } = useWriteContract();
  const {
    data: claimReceipt,
    isLoading: isClaimConfirming, // Expose this loading state
    isSuccess: isClaimConfirmed,
    error: claimReceiptError,
  } = useWaitForTransactionReceipt({ hash: claimTxHash });

  // --- Handle Single Claim ---
  const handleClaimPermit = useCallback(async (permitToClaim: PermitData): Promise<boolean> => {
    const permitKey = `${permitToClaim.nonce}-${permitToClaim.networkId}`;
    // console.log(`Attempting to claim permit: ${permitKey}`);

    // --- Pre-claim checks ---
    if (!isConnected || !address || !chain || !writeContractAsync) {
      setError("Wallet not connected or chain/write function missing.");
      // No state update needed here as button should already be disabled
      return false;
    }
    if (permitToClaim.networkId !== chain.id) {
      const networkError = `Please switch wallet to the correct network (ID: ${permitToClaim.networkId})`;
      setError(networkError);
      // No state update needed here as button should already be disabled
      return false;
    }
    if (!hasRequiredFields(permitToClaim)) {
      const incompleteError = "Permit data is incomplete.";
      setError(incompleteError);
      // No state update needed here as button should already be disabled
      return false;
    }
    // Re-check prerequisites just before claiming
    if (permitToClaim.type === "erc20-permit") {
      const balanceErrorMsg = `Insufficient balance: Owner (${permitToClaim.owner}) does not have enough tokens.`;
      const allowanceErrorMsg = `Insufficient allowance: Owner (${permitToClaim.owner}) has not approved Permit2 enough tokens.`;
      // Corrected typo: checkErrorMsg -> permitToClaim.checkError
      if (permitToClaim.ownerBalanceSufficient === false) {
        console.error(balanceErrorMsg);
        setError(balanceErrorMsg); // Show global error
        return false;
      }
      if (permitToClaim.permit2AllowanceSufficient === false) {
        console.error(allowanceErrorMsg);
        setError(allowanceErrorMsg); // Show global error
        return false;
      }
      if (permitToClaim.checkError) {
        // Use the actual error message from the permit data
        const checkErrorMsg = `Prerequisite check failed: ${permitToClaim.checkError}`;
        console.error(checkErrorMsg);
        setError(checkErrorMsg); // Show global error
        return false;
      }
    }

    // --- Claim Submission ---
    resetWriteContract(); // Reset previous write state

    // Set UI state to Pending
    setPermits((currentPermits) =>
      currentPermits.map((p) =>
        p.nonce === permitToClaim.nonce && p.networkId === permitToClaim.networkId
          ? { ...p, claimStatus: "Pending", claimError: undefined, transactionHash: undefined }
          : p
      )
    );

    // --- Pre-Simulation ---
    let simulationSuccessful = false;
    try {
        // Add check for publicClient
        if (!publicClient) {
            throw new Error("Public client not available for simulation.");
        }
        if (permitToClaim.type !== "erc20-permit" || !permitToClaim.amount || !permitToClaim.token?.address) {
            throw new Error("Invalid ERC20 permit data for simulation.");
        }
        const permitArgs = {
            permitted: { token: permitToClaim.token.address as Address, amount: BigInt(permitToClaim.amount) },
            nonce: BigInt(permitToClaim.nonce),
            deadline: BigInt(permitToClaim.deadline),
        };
        const transferDetailsArgs = { to: permitToClaim.beneficiary as Address, requestedAmount: BigInt(permitToClaim.amount) };

        // console.log(`Simulating claim for permit: ${permitKey}`);
        await publicClient.simulateContract({
            address: PERMIT2_ADDRESS,
            abi: permit2ABI,
            functionName: "permitTransferFrom",
            args: [permitArgs, transferDetailsArgs, permitToClaim.owner as Address, permitToClaim.signature as Hex],
            account: address, // Use connected address for simulation
        });
        // console.log(`Simulation successful for permit: ${permitKey}`);
        simulationSuccessful = true;

    } catch (simError) {
        console.warn(`Claim simulation failed for ${permitKey}:`, simError);
        if (isNonceUsedError(simError)) {
            // console.log(`Nonce already used for ${permitKey} detected during pre-simulation. Marking as claimed.`);
            setError("Permit already claimed."); // Set specific global error for the modal
            updatePermitStatusCache(permitKey, { isNonceUsed: true, checkError: undefined }); // Update cache
            setPermits((currentPermits) => // Update local state
                currentPermits.map((p) =>
                    p.nonce === permitToClaim.nonce && p.networkId === permitToClaim.networkId
                        ? { ...p, claimStatus: "Success", status: "Claimed", claimError: undefined, transactionHash: undefined } // Mark as claimed, clear specific error on row
                        : p
                )
            );
        } else {
            // For other simulation errors, set the global error but clear the specific permit error
            const reason = simError instanceof BaseError ? simError.shortMessage : (simError instanceof Error ? simError.message : "Unknown simulation error");
            setError(`Claim simulation failed: ${reason}`); // Set generic global error for the modal
            setPermits((currentPermits) =>
                currentPermits.map((p) =>
                    p.nonce === permitToClaim.nonce && p.networkId === permitToClaim.networkId
                        ? { ...p, claimStatus: "Error", claimError: undefined, transactionHash: undefined } // Set Error status, clear specific claimError
                        : p
                )
            );
        }
        return false; // Stop claim process if simulation fails
    }

    // --- Actual Submission (only if simulation passed) ---
    if (!simulationSuccessful) {
        // Should not happen if logic above is correct, but as a safeguard
        console.error("Simulation did not succeed, but error was not caught. Aborting claim.");
        setError("Internal error during claim simulation.");
         setPermits((currentPermits) =>
            currentPermits.map((p) =>
                p.nonce === permitToClaim.nonce && p.networkId === permitToClaim.networkId
                    ? { ...p, claimStatus: "Error", claimError: "Internal simulation error", transactionHash: undefined }
                    : p
            )
        );
        return false;
    }

    try {
      // Re-construct args (or reuse if scope allows, but safer to reconstruct)
       if (permitToClaim.type !== "erc20-permit" || !permitToClaim.amount || !permitToClaim.token?.address) {
        throw new Error("Invalid ERC20 permit data for submission."); // Should be caught earlier, but belt-and-suspenders
      }
      const permitArgs = {
        permitted: { token: permitToClaim.token.address as Address, amount: BigInt(permitToClaim.amount) },
        nonce: BigInt(permitToClaim.nonce),
        deadline: BigInt(permitToClaim.deadline),
      };
      const transferDetailsArgs = { to: permitToClaim.beneficiary as Address, requestedAmount: BigInt(permitToClaim.amount) };

      // Submit transaction
      // console.log(`Submitting actual claim transaction for permit: ${permitKey}`);
      const txHash = await writeContractAsync({
        address: PERMIT2_ADDRESS,
        abi: permit2ABI,
        functionName: "permitTransferFrom",
        args: [permitArgs, transferDetailsArgs, permitToClaim.owner as Address, permitToClaim.signature as Hex],
      });

      // console.log(`Claim transaction sent for ${permitKey}:`, txHash);
      // Update permit state with hash (still Pending)
      setPermits((currentPermits) =>
        currentPermits.map((p) => (p.nonce === permitToClaim.nonce && p.networkId === permitToClaim.networkId ? { ...p, transactionHash: txHash } : p))
      );
      return true; // Indicate success (submission)

    } catch (err) {
      console.warn(`Claim submission failed for ${permitKey}:`, err); // Use warn for potential rejections

      // Handle different error types
      if (isUserRejection(err)) {
        // console.log(`User rejected claim for ${permitKey}.`);
        // Reset status without error
        setPermits((currentPermits) =>
          currentPermits.map((p) =>
            p.nonce === permitToClaim.nonce && p.networkId === permitToClaim.networkId
              ? { ...p, claimStatus: "Idle", claimError: undefined, transactionHash: undefined } // Reset to Idle
              : p
          )
        );
      } else if (isNonceUsedError(err)) {
        // If it's a nonce error, treat as claimed immediately
        // console.log(`Nonce already used for ${permitKey}. Marking as claimed.`);
        updatePermitStatusCache(permitKey, { isNonceUsed: true, checkError: undefined });
        setPermits((currentPermits) =>
          currentPermits.map((p) =>
            p.nonce === permitToClaim.nonce && p.networkId === permitToClaim.networkId
              ? { ...p, claimStatus: "Success", status: "Claimed", claimError: undefined, transactionHash: undefined } // Mark as claimed
              : p
          )
        );
      } else {
        // Handle other errors globally
        setError("Claim failed. Please try again.");
        setPermits((currentPermits) =>
          currentPermits.map((p) =>
            p.nonce === permitToClaim.nonce && p.networkId === permitToClaim.networkId
              ? { ...p, claimStatus: "Error", claimError: undefined, transactionHash: undefined } // Set Error, clear specific message
              : p
          )
        );
      }
      return false; // Indicate failure
    }
  // Corrected dependency array for useCallback
  }, [isConnected, address, chain, publicClient, writeContractAsync, setPermits, setError, resetWriteContract, updatePermitStatusCache]);

  // --- Handle Sequential Claim ---
  const handleClaimAllValidSequential = useCallback(async () => {
    setSequentialClaimError(null);
    setIsClaimingSequentially(true);
    // console.log("Attempting sequential claim: Finding all valid permits...");

    if (!publicClient || !address || !chain) {
      setSequentialClaimError("Wallet not connected or client unavailable.");
      setIsClaimingSequentially(false);
      return;
    }

    const candidatePermits = claimablePermits; // Use pre-filtered list

    if (candidatePermits.length === 0) {
      setSequentialClaimError("No valid permits found on this network to claim.");
      setIsClaimingSequentially(false);
      return;
    }

    const validPermitsToClaim: PermitData[] = [];
    // console.log(`Found ${candidatePermits.length} candidates. Simulating individually...`);

    // --- Simulation Phase ---
    for (const permit of candidatePermits) {
      const permitKey = `${permit.nonce}-${permit.networkId}`;
      // console.log(`  Simulating permit nonce: ${permit.nonce}...`);
      try {
        // Ensure required fields for simulation
        if (permit.type !== "erc20-permit" || !permit.amount || !permit.token?.address || !permit.owner || !permit.signature || !permit.beneficiary || !permit.deadline) {
          throw new Error("Incomplete data for simulation.");
        }
        const permitArgs = {
          permitted: { token: permit.token.address as Address, amount: BigInt(permit.amount) },
          nonce: BigInt(permit.nonce),
          deadline: BigInt(permit.deadline),
        };
        const transferDetailsArgs = { to: permit.beneficiary as Address, requestedAmount: BigInt(permit.amount) };

        await publicClient.simulateContract({
          address: PERMIT2_ADDRESS,
          abi: permit2ABI,
          functionName: "permitTransferFrom",
          args: [permitArgs, transferDetailsArgs, permit.owner as Address, permit.signature as Hex],
          account: address,
        });

        // console.log(`    Permit ${permit.nonce} simulation successful.`);
        validPermitsToClaim.push(permit);
      } catch (simError: unknown) {
        let reason = "Unknown simulation error";
        if (simError instanceof BaseError) {
          const revertError = simError.walk((err: unknown) => err instanceof Error && err.cause instanceof ContractFunctionRevertedError) as ContractFunctionRevertedError | null;
          reason = revertError?.reason ?? revertError?.shortMessage ?? simError.shortMessage ?? simError.message;
        } else if (simError instanceof Error) {
          reason = simError.message;
        }
        console.warn(`    Permit ${permit.nonce} simulation failed: ${reason}`);

        // Check if simulation failed due to nonce used
        if (isNonceUsedError(simError)) {
          // console.log(`Nonce already used for ${permitKey} detected during simulation. Marking as claimed.`);
          updatePermitStatusCache(permitKey, { isNonceUsed: true, checkError: undefined });
          setPermits((current) =>
            current.map((p) =>
              p.nonce === permit.nonce && p.networkId === permit.networkId
                ? { ...p, claimStatus: "Success", status: "Claimed", claimError: undefined }
                : p
            )
          );
        } else {
          // Mark as error for other simulation failures
          setPermits((current) =>
            current.map((p) =>
              p.nonce === permit.nonce && p.networkId === permit.networkId ? { ...p, claimStatus: "Error", claimError: `Sim fail: ${reason}` } : p
            )
          );
        }
      }
    }

    if (validPermitsToClaim.length === 0) {
      setSequentialClaimError("Could not find any permits that passed simulation.");
      setIsClaimingSequentially(false);
      return;
    }

    // --- Submission Phase ---
    // console.log(`Proceeding to claim ${validPermitsToClaim.length} validated permits sequentially:`, validPermitsToClaim.map((p) => p.nonce));
    let failures = 0;
    for (const permit of validPermitsToClaim) {
      const success = await handleClaimPermit(permit); // Reuse single claim logic (handles errors internally)
      if (!success) {
        // Failure already handled within handleClaimPermit (state set, error potentially shown)
        failures++;
      }
      // Optional: Add a small delay between sequential claims if needed
      // await new Promise(resolve => setTimeout(resolve, 500));
    } // Corrected closing brace for the for loop

    // console.log(`Sequential claim process finished. Failures: ${failures}`); // Removed successes
    if (failures > 0) {
      // Use global error for summary, individual errors handled by handleClaimPermit
      setError(`${failures} out of ${validPermitsToClaim.length} claim submissions failed or were rejected. Check individual permits.`);
    }

    // --- Initiate Swaps After Sequential Claims ---
    const preferredTokenAddress = localStorage.getItem('preferredRewardToken') as Address | null;
    if (preferredTokenAddress && walletClient && address && chain) {
      // console.log("Checking for swaps needed after sequential claims...");
      setSwapSubmissionStatus({}); // Reset swap status

      const successfullyClaimedPermits = permits.filter(p =>
        validPermitsToClaim.some(vp => vp.nonce === p.nonce && vp.networkId === p.networkId) && // Was part of the batch attempted
        p.claimStatus === 'Success' // And actually succeeded
      );

      if (successfullyClaimedPermits.length > 0) {
        const swapsToInitiate = new Map<Address, bigint>(); // Map<tokenAddress, totalAmount>

        // Group successful claims by token address
        successfullyClaimedPermits.forEach(p => {
          if (p.tokenAddress && p.amount && p.tokenAddress.toLowerCase() !== preferredTokenAddress.toLowerCase()) {
            const currentTotal = swapsToInitiate.get(p.tokenAddress as Address) || 0n;
            try {
              swapsToInitiate.set(p.tokenAddress as Address, currentTotal + BigInt(p.amount));
            } catch (e) { console.error("Error summing amount for swap:", e); }
          }
        });

        if (swapsToInitiate.size > 0) {
          // console.log(`Need to initiate ${swapsToInitiate.size} swaps.`);
          setError(null); // Clear previous claim errors before showing swap status

          for (const [tokenInAddress, totalAmountIn] of swapsToInitiate.entries()) {
            const tokenInfo = getTokenInfo(chain.id, tokenInAddress);
            const symbol = tokenInfo?.symbol || tokenInAddress.substring(0, 6);
            const swapKey = tokenInAddress;

            setSwapSubmissionStatus(prev => ({ ...prev, [swapKey]: { status: 'submitting', message: `Submitting swap for ${symbol}...` } }));

            try {
              const { orderUid } = await initiateCowSwap({
                tokenIn: tokenInAddress,
                tokenOut: preferredTokenAddress,
                amountIn: totalAmountIn,
                userAddress: address,
                walletClient: walletClient,
                chainId: chain.id, // Add missing chainId
              });
              // console.log(`Swap submitted for ${symbol}. Order UID: ${orderUid}`);
              setSwapSubmissionStatus(prev => ({ ...prev, [swapKey]: { status: 'submitted', message: `Swap for ${symbol} submitted (UID: ${orderUid.substring(0, 8)}...)`, orderUid } }));
            } catch (swapError) {
              console.error(`Swap initiation failed for ${symbol}:`, swapError);
              const message = swapError instanceof Error ? swapError.message : "Unknown swap error";
              setSwapSubmissionStatus(prev => ({ ...prev, [swapKey]: { status: 'error', message: `Swap failed for ${symbol}: ${message}` } }));
              // Optionally set a global error as well
              setError(prevError => `${prevError ? prevError + '; ' : ''}Swap failed for ${symbol}.`);
            }
          }
        } else {
          // console.log("No swaps needed (all claimed tokens are the preferred token or none succeeded).");
        }
      } else {
        // console.log("No permits were successfully claimed in this batch, skipping swaps.");
      }
    } else if (preferredTokenAddress && !walletClient) {
        console.warn("Cannot initiate swaps: Wallet client not available.");
        setError("Could not access wallet to sign swap orders.");
    }

    setIsClaimingSequentially(false); // Finished claims and swap attempts
  }, [publicClient, address, chain, claimablePermits, setPermits, handleClaimPermit, setError, updatePermitStatusCache, walletClient, permits]); // Added walletClient and permits


  // --- Effects for Handling Transaction Results ---
  useEffect(() => {
    // Effect for successful confirmation
    if (isClaimConfirmed && claimReceipt && claimTxHash) {
      // console.log("Claim successful, Tx Hash:", claimTxHash);
      let claimedPermitKey: string | null = null;
      setPermits((current) =>
        current.map((p) => {
          if (p.transactionHash === claimTxHash) {
            claimedPermitKey = `${p.nonce}-${p.networkId}`;
            return { ...p, claimStatus: "Success", status: "Claimed", claimError: undefined };
          }
          return p;
        })
      );
      if (claimedPermitKey) {
        // console.log(`Updating cache for claimed permit: ${claimedPermitKey}`);
        updatePermitStatusCache(claimedPermitKey, { isNonceUsed: true, checkError: undefined });
      }
    }
  }, [isClaimConfirmed, claimReceipt, claimTxHash, setPermits, updatePermitStatusCache]); // Dependencies for success

  useEffect(() => {
    // Effect for confirmation error
    if (claimReceiptError && claimTxHash) {
      console.error("Claim tx confirmation failed, Tx Hash:", claimTxHash, claimReceiptError);
      let failedPermitKey: string | null = null;
      let permitNonce: string | null = null;
      let permitNetworkId: number | null = null;

      // Find the permit associated with the failed hash
      const permitWithError = permits.find(p => p.transactionHash === claimTxHash);
      if (permitWithError) {
          failedPermitKey = `${permitWithError.nonce}-${permitWithError.networkId}`;
          permitNonce = permitWithError.nonce;
          permitNetworkId = permitWithError.networkId;
      }

      if (failedPermitKey && isNonceUsedError(claimReceiptError)) {
         // If confirmation failed due to nonce, treat as claimed
         // console.log(`Nonce already used detected during confirmation for Tx ${claimTxHash}. Marking as claimed.`);
         updatePermitStatusCache(failedPermitKey, { isNonceUsed: true, checkError: undefined });
         setPermits((current) =>
            current.map((p) =>
              p.nonce === permitNonce && p.networkId === permitNetworkId
                ? { ...p, claimStatus: "Success", status: "Claimed", claimError: undefined } // Mark as claimed
                : p
            )
         );
      } else {
        // Handle other confirmation errors globally
        setError("Claim confirmation failed. Please check the transaction or try again later.");
        setPermits((current) =>
          current.map((p) =>
            p.transactionHash === claimTxHash
              ? { ...p, claimStatus: "Error", claimError: undefined } // Set Error, clear specific message
              : p
          )
        );
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isClaimConfirmed, claimReceipt, claimReceiptError, claimTxHash, setPermits, updatePermitStatusCache, setError]); // Removed 'permits' dependency

  useEffect(() => {
    // Effect for submission error (writeContractError)
    if (writeContractError) {
      console.warn("Claim submission error:", writeContractError);
      let pendingPermitKey: string | null = null;
      let permitNonce: string | null = null;
      let permitNetworkId: number | null = null;

      // Find the permit that was in the "Pending" state without a hash
      const permitWithError = permits.find(p => p.claimStatus === "Pending" && !p.transactionHash);
       if (permitWithError) {
          pendingPermitKey = `${permitWithError.nonce}-${permitWithError.networkId}`;
          permitNonce = permitWithError.nonce;
          permitNetworkId = permitWithError.networkId;
      }

      if (pendingPermitKey && isNonceUsedError(writeContractError)) {
         // If submission failed due to nonce, treat as claimed
         // console.log("Nonce already used detected during submission. Marking as claimed.");
         updatePermitStatusCache(pendingPermitKey, { isNonceUsed: true, checkError: undefined });
         setPermits((current) =>
            current.map((p) =>
              p.nonce === permitNonce && p.networkId === permitNetworkId
                ? { ...p, claimStatus: "Success", status: "Claimed", claimError: undefined } // Mark as claimed
                : p
            )
         );
      } else if (isUserRejection(writeContractError)) {
        // Handle user rejection
        // console.log("User rejected claim submission.");
        setPermits((current) =>
          current.map((p) =>
            p.nonce === permitNonce && p.networkId === permitNetworkId
              ? { ...p, claimStatus: "Idle", claimError: undefined } // Reset to Idle
              : p
          )
        );
      } else {
        // Handle other submission errors globally
        setError("Claim failed. Please try again.");
        setPermits((current) =>
          current.map((p) =>
            p.nonce === permitNonce && p.networkId === permitNetworkId
              ? { ...p, claimStatus: "Error", claimError: undefined } // Set Error
              : p
          )
        );
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [writeContractError, setPermits, setError, updatePermitStatusCache]); // Removed 'permits' dependency

  return {
    handleClaimPermit,
    handleClaimAllValidSequential,
    isClaimingSequentially,
    sequentialClaimError,
    setSequentialClaimError, // Expose setter if needed by component
    isClaimConfirming, // Expose confirmation loading state
    claimTxHash, // Expose hash for table row updates
    swapSubmissionStatus, // Expose swap status
  };
}
