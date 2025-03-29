import { useState, useEffect, useCallback } from "react";
import { useWriteContract, useWaitForTransactionReceipt, usePublicClient, useAccount } from "wagmi";
import { type Address, type Hex, BaseError, ContractFunctionRevertedError } from "viem"; // Removed unused Chain import
import type { PermitData } from "../../../shared/types";
import permit2ABI from "../fixtures/permit2-abi";
import { hasRequiredFields } from "../utils/permit-utils";

const PERMIT2_ADDRESS = "0x000000000022D473030F116dDEE9F6B43aC78BA3" as Address;

interface UsePermitClaimingProps {
  permits: PermitData[];
  setPermits: React.Dispatch<React.SetStateAction<PermitData[]>>;
  claimablePermits: PermitData[]; // Pass pre-filtered claimable permits
  setError: React.Dispatch<React.SetStateAction<string | null>>; // To set general errors
}

export function usePermitClaiming({ setPermits, claimablePermits, setError }: UsePermitClaimingProps) { // Removed unused permits prop
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

    if (!isConnected || !address || !chain || !writeContractAsync) {
      setError("Wallet not connected or chain/write function missing.");
      setPermits((current) =>
        current.map((p) =>
          p.nonce === permitToClaim.nonce && p.networkId === permitToClaim.networkId ? { ...p, claimStatus: "Error", claimError: "Wallet not connected." } : p
        )
      );
      return false;
    }
    if (permitToClaim.networkId !== chain.id) {
      const networkError = `Please switch wallet to the correct network (ID: ${permitToClaim.networkId})`;
      setError(networkError);
      setPermits((current) =>
        current.map((p) =>
          p.nonce === permitToClaim.nonce && p.networkId === permitToClaim.networkId ? { ...p, claimStatus: "Error", claimError: networkError } : p
        )
      );
      return false;
    }
    if (!hasRequiredFields(permitToClaim)) {
      const incompleteError = "Permit data is incomplete.";
      setError(incompleteError);
      setPermits((current) =>
        current.map((p) =>
          p.nonce === permitToClaim.nonce && p.networkId === permitToClaim.networkId ? { ...p, claimStatus: "Error", claimError: incompleteError } : p
        )
      );
      return false;
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
  }, [isConnected, address, chain, writeContractAsync, setPermits, setError, resetWriteContract]);

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

    for (const permit of candidatePermits) {
      console.log(`  Simulating permit nonce: ${permit.nonce}...`);
      try {
        const permitArgs = {
          permitted: { token: permit.token!.address as Address, amount: BigInt(permit.amount!) },
          nonce: BigInt(permit.nonce),
          deadline: BigInt(permit.deadline),
        };
        const transferDetailsArgs = { to: permit.beneficiary as Address, requestedAmount: BigInt(permit.amount!) };

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

    console.log(`Proceeding to claim ${validPermitsToClaim.length} validated permits sequentially:`, validPermitsToClaim.map((p) => p.nonce));

    let successes = 0;
    let failures = 0;
    for (const permit of validPermitsToClaim) {
      const success = await handleClaimPermit(permit); // Reuse single claim logic
      if (success) {
        successes++;
      } else {
        failures++;
      }
    }

    console.log(`Sequential claim process finished. Successes: ${successes}, Failures: ${failures}`);
    if (failures > 0) {
      setSequentialClaimError(`${failures} out of ${validPermitsToClaim.length} claim submissions failed. Check individual permits.`);
    }

    setIsClaimingSequentially(false);
  }, [publicClient, address, chain, claimablePermits, setPermits, handleClaimPermit]);

  // --- Effects for Handling Transaction Results ---
  useEffect(() => {
    if (isClaimConfirmed && claimReceipt && claimTxHash) {
      console.log("Claim successful, Tx Hash:", claimTxHash);
      setPermits((current) =>
        current.map((p) => (p.transactionHash === claimTxHash ? { ...p, claimStatus: "Success", status: "Claimed", claimError: undefined } : p))
      );
    }
    if (claimReceiptError && claimTxHash) {
      console.error("Claim tx failed, Tx Hash:", claimTxHash, claimReceiptError.message);
      setPermits((current) =>
        current.map((p) => (p.transactionHash === claimTxHash ? { ...p, claimStatus: "Error", claimError: claimReceiptError.message } : p))
      );
    }
  }, [isClaimConfirmed, claimReceipt, claimReceiptError, claimTxHash, setPermits]);

  useEffect(() => {
    if (writeContractError) {
      console.error("Claim submission failed:", writeContractError.message);
      setPermits((current) =>
        current.map((p) => (p.claimStatus === "Pending" && !p.transactionHash ? { ...p, claimStatus: "Error", claimError: writeContractError.message } : p))
      );
    }
  }, [writeContractError, setPermits]);

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
