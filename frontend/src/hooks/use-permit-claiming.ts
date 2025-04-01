import { useState, useEffect, useCallback } from "react";
import { useWriteContract, useWaitForTransactionReceipt, usePublicClient, useAccount } from "wagmi";
import { type Address, type Hex, BaseError, ContractFunctionRevertedError, UserRejectedRequestError } from "viem";
import type { PermitData } from "../types";
import permit2ABI from "../fixtures/permit2-abi";
import { hasRequiredFields } from "../utils/permit-utils";

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

// Helper to check for user rejection errors
function isUserRejection(error: unknown): boolean {
  if (error instanceof UserRejectedRequestError) {
    return true;
  }
  // Recursively check causes for common codes or messages
  let cause = (error as any)?.cause;
  while (cause) {
    if ((cause as any)?.code === 4001 || (cause as any)?.code === "ACTION_REJECTED") {
      return true;
    }
    if (typeof (cause as any)?.message === "string" && ((cause as any).message.includes("User rejected") || (cause as any).message.includes("denied transaction signature"))) {
      return true;
    }
    cause = (cause as any)?.cause;
  }
  // Check top-level message as fallback
  if (typeof (error as any)?.message === "string" && ((error as any).message.includes("User rejected") || (error as any).message.includes("denied transaction signature"))) {
    return true;
  }
  return false;
}

// Helper to check for nonce already used errors
function isNonceUsedError(error: unknown): boolean {
  // Recursively check causes for common codes or messages
  let currentError = error;
  while (currentError) {
    const message = (currentError as any)?.message?.toLowerCase() || "";
    // Add known strings indicating nonce issues from Permit2 or RPCs
    if (message.includes("invalid nonce") || message.includes("nonce already used") || message.includes("nonce too low")) {
      return true;
    }
    // Check specific revert reasons if available (might need adjustment based on actual contract errors)
    if (currentError instanceof BaseError) {
       const revertError = currentError.walk((err: unknown) => err instanceof Error && err.cause instanceof ContractFunctionRevertedError) as ContractFunctionRevertedError | null;
       const reason = revertError?.reason?.toLowerCase();
       if (reason && (reason.includes("invalid nonce") || reason.includes("nonce already used"))) {
           return true;
       }
    }
    currentError = (currentError as any)?.cause;
  }
  return false;
}


export function usePermitClaiming({ permits, setPermits, claimablePermits, setError, updatePermitStatusCache }: UsePermitClaimingProps) {
  const [sequentialClaimError, setSequentialClaimError] = useState<string | null>(null);
  const [isClaimingSequentially, setIsClaimingSequentially] = useState(false);

  // Wallet and client hooks
  const { address, isConnected, chain } = useAccount();
  const publicClient = usePublicClient();

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
    console.log(`Attempting to claim permit: ${permitKey}`);

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
      const checkErrorMsg = `Prerequisite check failed: ${permitToClaim.checkError}`;
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

      // Submit transaction
      const txHash = await writeContractAsync({
        address: PERMIT2_ADDRESS,
        abi: permit2ABI,
        functionName: "permitTransferFrom",
        args: [permitArgs, transferDetailsArgs, permitToClaim.owner as Address, permitToClaim.signature as Hex],
      });

      console.log(`Claim transaction sent for ${permitKey}:`, txHash);
      // Update permit state with hash (still Pending)
      setPermits((currentPermits) =>
        currentPermits.map((p) => (p.nonce === permitToClaim.nonce && p.networkId === permitToClaim.networkId ? { ...p, transactionHash: txHash } : p))
      );
      return true; // Indicate success (submission)

    } catch (err) {
      console.warn(`Claim submission failed for ${permitKey}:`, err); // Use warn for potential rejections

      // Handle different error types
      if (isUserRejection(err)) {
        console.log(`User rejected claim for ${permitKey}.`);
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
        console.log(`Nonce already used for ${permitKey}. Marking as claimed.`);
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
  }, [isConnected, address, chain, writeContractAsync, setPermits, setError, resetWriteContract, updatePermitStatusCache]);

  // --- Handle Sequential Claim ---
  const handleClaimAllValidSequential = useCallback(async () => {
    setSequentialClaimError(null);
    setIsClaimingSequentially(true);
    console.log("Attempting sequential claim: Finding all valid permits...");

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
    console.log(`Found ${candidatePermits.length} candidates. Simulating individually...`);

    // --- Simulation Phase ---
    for (const permit of candidatePermits) {
      const permitKey = `${permit.nonce}-${permit.networkId}`;
      console.log(`  Simulating permit nonce: ${permit.nonce}...`);
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

        console.log(`    Permit ${permit.nonce} simulation successful.`);
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
          console.log(`Nonce already used for ${permitKey} detected during simulation. Marking as claimed.`);
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
    console.log(`Proceeding to claim ${validPermitsToClaim.length} validated permits sequentially:`, validPermitsToClaim.map((p) => p.nonce));
    let successes = 0;
    let failures = 0;
    for (const permit of validPermitsToClaim) {
      const success = await handleClaimPermit(permit); // Reuse single claim logic (handles errors internally)
      if (success) {
        successes++;
      } else {
        // Failure already handled within handleClaimPermit (state set, error potentially shown)
        failures++;
      }
      // Optional: Add a small delay between sequential claims if needed
      // await new Promise(resolve => setTimeout(resolve, 500));
    }

    console.log(`Sequential claim process finished. Successes: ${successes}, Failures: ${failures}`);
    if (failures > 0) {
      // Use global error for summary, individual errors handled by handleClaimPermit
      setError(`${failures} out of ${validPermitsToClaim.length} claim submissions failed or were rejected. Check individual permits.`);
    }

    setIsClaimingSequentially(false);
  }, [publicClient, address, chain, claimablePermits, setPermits, handleClaimPermit, setError, updatePermitStatusCache]); // Added setError, updatePermitStatusCache

  // --- Effects for Handling Transaction Results ---
  useEffect(() => {
    // Effect for successful confirmation
    if (isClaimConfirmed && claimReceipt && claimTxHash) {
      console.log("Claim successful, Tx Hash:", claimTxHash);
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
        console.log(`Updating cache for claimed permit: ${claimedPermitKey}`);
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
         console.log(`Nonce already used detected during confirmation for Tx ${claimTxHash}. Marking as claimed.`);
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
         console.log("Nonce already used detected during submission. Marking as claimed.");
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
        console.log("User rejected claim submission.");
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
  };
}
