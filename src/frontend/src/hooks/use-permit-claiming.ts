// use-permit-claiming.ts: Handles single and batch permit claiming

import { Dispatch, SetStateAction, useState } from "react";
import { Address, Chain, PublicClient, WalletClient } from "viem";
import { PERMIT3_ADDRESS } from "../constants/config.ts";
import permit3Abi from "../fixtures/permit3-abi.json";
import { AllowanceAndBalance, PermitData } from "../types.ts";

if (!permit3Abi) {
  throw new Error("Permit3 ABI could not be loaded");
}

interface UsePermitClaimingProps {
  permits: PermitData[];
  setPermits: Dispatch<SetStateAction<PermitData[]>>;
  setError: Dispatch<SetStateAction<string | null>>;
  updatePermitStatusCache: (permitKey: string, status: Partial<PermitData>) => void;
  publicClient: PublicClient | null;
  walletClient: WalletClient | null;
  address: Address | undefined;
  chain: Chain | null;
  setBalancesAndAllowances: Dispatch<SetStateAction<Map<string, AllowanceAndBalance>>>;
}

async function simulatePermitTransferFrom(publicClient: PublicClient, address: Address, permit: PermitData) {
  return await publicClient.simulateContract({
    address: permit.permit2Address,
    abi: permit3Abi,
    functionName: "permitTransferFrom",
    args: [
      {
        permitted: {
          token: permit.tokenAddress,
          amount: permit.amount,
        },
        nonce: BigInt(permit.nonce),
        deadline: BigInt(permit.deadline),
      },
      {
        to: address,
        requestedAmount: permit.amount,
      },
      permit.owner,
      permit.signature,
    ],
    account: address,
  });
}

async function simulateBatchPermitTransferFrom(publicClient: PublicClient, address: Address, permitsToClaim: PermitData[]) {
  return await publicClient.simulateContract({
    address: PERMIT3_ADDRESS,
    abi: permit3Abi,
    functionName: "batchPermitTransferFrom",
    args: [
      permitsToClaim.map((permit) => ({
        permitted: {
          token: permit.tokenAddress,
          amount: permit.amount,
        },
        nonce: BigInt(permit.nonce),
        deadline: BigInt(permit.deadline),
      })),
      permitsToClaim.map((permit) => ({
        to: address,
        requestedAmount: permit.amount,
      })),
      permitsToClaim.map((permit) => permit.owner),
      permitsToClaim.map((permit) => permit.signature),
    ],
    account: address,
  });
}

export function usePermitClaiming({
  permits,
  setPermits,
  setError,
  updatePermitStatusCache,
  publicClient,
  walletClient,
  address,
  chain,
  setBalancesAndAllowances,
}: UsePermitClaimingProps) {
  const [isClaiming, setIsClaiming] = useState(false);
  const [sequentialClaimError, setSequentialClaimError] = useState<string | null>(null);
  const [swapSubmissionStatus] = useState<Record<string, { status: string; message: string }>>({});

  const reduceAllowance = (permits: PermitData[]) => {
    setBalancesAndAllowances((prev) => {
      const newMap = new Map(prev);
      for (const permit of permits) {
        const key = `${permit.networkId}-${permit.permit2Address}-${permit.tokenAddress}-${permit.owner}`;
        const existing = newMap.get(key);
        if (existing) {
          newMap.set(key, {
            ...existing,
            allowance: existing.allowance ? existing.allowance - permit.amount : undefined,
            balance: existing.balance ? existing.balance - permit.amount : undefined,
            maxClaimable: existing.maxClaimable ? existing.maxClaimable - permit.amount : undefined,
          });
        }
      }
      return newMap;
    });
  };

  const handleClaimPermit = async (permit: PermitData): Promise<{ success: boolean; txHash: string }> => {
    const permitKey = permit.signature;

    if (!address || !chain || !walletClient || !publicClient) {
      setError("Wallet not connected or chain unavailable");
      return { success: false, txHash: "" };
    }

    setPermits((prev) => prev.map((p) => (p.signature === permit.signature ? { ...p, claimStatus: "Pending" } : p)));

    try {
      // 1. First simulate the transaction
      if (!permit3Abi) {
        throw new Error("Permit3 ABI not found - cannot simulate transaction");
      }

      const { request } = await simulatePermitTransferFrom(publicClient, address, permit);

      console.log("Transaction simulation successful", { request });

      // 2. Send the actual transaction
      const txHash = await walletClient.writeContract(request);

      // 3. Wait for transaction receipt
      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
      console.log("Transaction completed", { receipt });
      if (receipt.status !== "success") {
        throw new Error(`Transaction failed with status: ${receipt.status}`);
      }

      // Update status to success
      setPermits((prev) =>
        prev.map((p) => (p.signature === permit.signature ? { ...p, claimStatus: "Success", status: "Claimed", transactionHash: txHash } : p))
      );
      updatePermitStatusCache(permit.signature, { status: "Claimed" });
      reduceAllowance([permit]);

      // Record transaction in database
      try {
        await fetch("/api/permits/record-claim", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            signature: permit.signature,
            transactionHash: txHash,
          }),
        });
      } catch (error) {
        console.error("Failed to record transaction:", error);
      }

      return { success: true, txHash };
    } catch (error) {
      console.error("Permit claim failed", {
        error,
        permitKey,
        nonce: permit.nonce,
        networkId: permit.networkId,
      });

      if (error instanceof Error && error.message.includes("InvalidNonce")) {
        console.error("Invalid nonce detected - marking permit as invalid");
        updatePermitStatusCache(permitKey, { status: "Invalid" });
      }

      setPermits((prev) => prev.map((p) => (p.nonce === permit.nonce && p.networkId === permit.networkId ? { ...p, claimStatus: "Error" } : p)));
      return { success: false, txHash: "" };
    }
  };

  const handleClaimSequential = async (permitsToClaim: PermitData[]) => {
    if (!walletClient || !address || !chain || !publicClient) {
      console.error("Sequential claim: Wallet not connected - client:", walletClient, "address:", address, "chain:", chain);
      setError("Wallet not connected or chain unavailable");
      return;
    } else {
      console.log("Sequential claim: Wallet connection verified - address:", address, "chain id:", chain.id);
    }

    setIsClaiming(true);
    setSequentialClaimError(null);
    setError(null);

    const toClaim = permitsToClaim;

    if (!toClaim.length) {
      console.warn("Sequential claim: No claimable permits found");
      setSequentialClaimError("No claimable permits found");
      setIsClaiming(false);
      return;
    }

    console.log(`Starting sequential claim for ${toClaim.length} permits`, {
      permits: toClaim.map((p) => ({
        nonce: p.nonce,
        networkId: p.networkId,
        token: p.tokenAddress,
      })),
    });

    // Update all permits to pending status
    setPermits((prev) => prev.map((p) => (toClaim.some((c) => c.signature === p.signature) ? { ...p, claimStatus: "Pending" } : p)));

    const successfullyClaimedPermits: PermitData[] = [];
    await Promise.allSettled(
      toClaim.map(async (permit) => {
        try {
          const { request } = await simulatePermitTransferFrom(publicClient, address, permit);

          console.log("Transaction simulation successful", { request });

          // 2. Send the actual transaction
          const txHash = await walletClient.writeContract(request);

          // 3. Wait for transaction receipt
          const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
          console.log("Transaction completed", { receipt });
          if (receipt.status !== "success") {
            throw new Error(`Transaction failed with status: ${receipt.status}`);
          }

          // Update status to success
          successfullyClaimedPermits.push(permit);
          setPermits((prev) =>
            prev.map((p) => (p.signature === permit.signature ? { ...p, claimStatus: "Success", status: "Claimed", transactionHash: txHash } : p))
          );
          updatePermitStatusCache(permit.signature, { status: "Claimed" });

          // Record transaction in database
          try {
            await fetch("/api/permits/record-claim", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                signature: permit.signature,
                transactionHash: txHash,
              }),
            });
          } catch (error) {
            console.error("Failed to record transaction:", error);
          }
        } catch (error) {
          console.error("Sequential claim processing error", { error });
          setPermits((prev) => prev.map((p) => (p.signature === permit.signature ? { ...p, claimStatus: "Error" } : p)));
        }
      })
    );
    reduceAllowance(successfullyClaimedPermits);
    setIsClaiming(false);
    console.log("Sequential claim completed successfully");
  };

  const handleClaimBatch = async (permitsToClaim: PermitData[]) => {
    if (!walletClient || !address || !chain || !publicClient) {
      console.error("Batch RPC: Wallet not connected - client:", walletClient, "address:", address, "chain:", chain);
      setError("Wallet not connected or chain unavailable");
      return { success: false, txHash: "" };
    } else {
      console.log("Batch RPC: Wallet connection verified - address:", address, "chain id:", chain.id);
    }

    setIsClaiming(true);
    setSequentialClaimError(null);
    setError(null);

    if (!permitsToClaim.length) {
      console.warn("Batch RPC: No claimable permits found");
      setSequentialClaimError("No claimable permits found");
      setIsClaiming(false);
      return { success: false, txHash: "" };
    }

    console.log(`Starting batch RPC for ${permitsToClaim.length} permits`, {
      permits: permitsToClaim.map((p) => ({
        nonce: p.nonce,
        networkId: p.networkId,
        token: p.tokenAddress,
      })),
    });

    let success = false;
    let txHash: `0x${string}` | undefined;
    try {
      // Update all permits to pending status
      setPermits((prev) => prev.map((p) => (permitsToClaim.some((c) => c.signature === p.signature) ? { ...p, claimStatus: "Pending" } : p)));

      const { request } = await simulateBatchPermitTransferFrom(publicClient, address, permitsToClaim);

      console.log("Transaction simulation successful", { request });

      // 2. Send the actual transaction
      txHash = await walletClient.writeContract(request);

      // 3. Wait for transaction receipt
      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
      console.log("Transaction completed", { receipt });
      if (receipt.status !== "success") {
        throw new Error(`Transaction failed with status: ${receipt.status}`);
      }

      setPermits((prev) =>
        prev.map((p) =>
          permitsToClaim.some((c) => c.signature === p.signature) ? { ...p, claimStatus: "Success", status: "Claimed", transactionHash: txHash } : p
        )
      );
      reduceAllowance(permitsToClaim);
      try {
        await Promise.all(
          permits.map((permit) => {
            updatePermitStatusCache(permit.signature, { status: "Claimed" });
            return fetch("http://localhost:8001/api/permits/record-claim", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                signature: permit.signature,
                transactionHash: txHash,
              }),
            });
          })
        );
      } catch (error) {
        console.error("Failed to record transaction:", error);
      }

      console.log("Batch RPC completed");
      success = true;
    } catch (error) {
      console.error("Batch RPC: Unhandled processing error", {
        error,
        context: "batch-processing",
      });
      setPermits((prev) => prev.map((p) => (permitsToClaim.some((c) => c.signature === p.signature) ? { ...p, claimStatus: "Error" } : p)));
      setError("Batch claim failed. Claim each permit individually.");
    } finally {
      setIsClaiming(false);
    }
    return { success, txHash: String(txHash) };
  };

  return {
    handleClaimPermit,
    handleClaimBatch,
    handleClaimSequential,
    isClaiming,
    sequentialClaimError,
    swapSubmissionStatus,
    walletConnectionError: !address || !chain ? "Wallet not connected" : null,
  };
}
