// use-permit-claiming.ts: Handles single and batch permit claiming

import { useCallback, useState } from "react";
import { Address, Chain, PublicClient, WalletClient } from "viem";
import { NEW_PERMIT2_ADDRESS } from "../constants/config.ts";
import permit2Abi from "../fixtures/permit2-abi.ts";
import { PermitData } from "../types.ts";

if (!permit2Abi) {
  throw new Error("Permit2 ABI could not be loaded");
}

interface UsePermitClaimingProps {
  permits: PermitData[];
  setPermits: React.Dispatch<React.SetStateAction<PermitData[]>>;
  setError: React.Dispatch<React.SetStateAction<string | null>>;
  updatePermitStatusCache: (permitKey: string, status: Partial<PermitData>) => void;
  publicClient: PublicClient | null;
  walletClient: WalletClient | null;
  address: Address | undefined;
  chain: Chain | null;
  claimablePermits?: PermitData[];
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
  claimablePermits,
}: UsePermitClaimingProps) {
  const [isClaimingSequentially, setIsClaimingSequentially] = useState(false);
  const [sequentialClaimError, setSequentialClaimError] = useState<string | null>(null);
  const [claimTxHash, setClaimTxHash] = useState<`0x${string}` | undefined>();
  const [swapSubmissionStatus] = useState<Record<string, { status: string; message: string }>>({});

  const handleClaimPermit = useCallback(
    async (permit: PermitData): Promise<{ success: boolean; txHash: string }> => {
      const permitKey = permit.signature;

      if (!address || !chain || !walletClient || !publicClient) {
        setError("Wallet not connected or chain unavailable");
        return { success: false, txHash: "" };
      }

      setPermits((prev) => prev.map((p) => (p.signature === permit.signature ? { ...p, claimStatus: "Pending" } : p)));

      try {
        setClaimTxHash(undefined);

        // 1. First simulate the transaction
        if (!permit2Abi) {
          throw new Error("Permit2 ABI not found - cannot simulate transaction");
        }

        const { request } = await publicClient.simulateContract({
          address: permit.permit2Address,
          abi: permit2Abi,
          functionName: "permitTransferFrom",
          args: [
            {
              permitted: {
                token: permit.tokenAddress,
                amount: BigInt(permit.amount ?? 0),
              },
              nonce: BigInt(permit.nonce),
              deadline: BigInt(permit.deadline),
            },
            {
              to: address,
              requestedAmount: BigInt(permit.amount ?? 0),
            },
            permit.owner,
            permit.signature,
          ],
          account: address,
        });

        console.log("Transaction simulation successful", { request });

        // 2. Send the actual transaction
        const txHash = await walletClient.writeContract(request);
        setClaimTxHash(txHash);

        // 3. Wait for transaction receipt
        const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
        console.log("Transaction completed", { receipt });

        // Update status to success
        setPermits((prev) => prev.map((p) => (p.signature === permit.signature ? { ...p, claimStatus: "Success", status: "Claimed" } : p)));
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
      } finally {
        // No need for setIsClaimConfirming since we use per-permit claimStatus
      }
    },
    [address, chain, walletClient, publicClient, setPermits, setError, updatePermitStatusCache]
  );

  const handleClaimSequential = useCallback(
    async (permitsToClaim: PermitData[]) => {
      if (!walletClient || !address || !chain || !publicClient) {
        console.error("Sequential claim: Wallet not connected - client:", walletClient, "address:", address, "chain:", chain);
        setError("Wallet not connected or chain unavailable");
        return;
      } else {
        console.log("Sequential claim: Wallet connection verified - address:", address, "chain id:", chain.id);
      }

      setIsClaimingSequentially(true);
      setSequentialClaimError(null);
      setError(null);

      const toClaim = permitsToClaim;

      if (!toClaim.length) {
        console.warn("Sequential claim: No claimable permits found");
        setSequentialClaimError("No claimable permits found");
        setIsClaimingSequentially(false);
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

      await Promise.allSettled(
        toClaim.map(async (permit) => {
          try {
            const { request } = await publicClient.simulateContract({
              address: permit.permit2Address,
              abi: permit2Abi,
              functionName: "permitTransferFrom",
              args: [
                {
                  permitted: {
                    token: permit.tokenAddress,
                    amount: BigInt(permit.amount ?? 0),
                  },
                  nonce: BigInt(permit.nonce),
                  deadline: BigInt(permit.deadline),
                },
                {
                  to: address,
                  requestedAmount: BigInt(permit.amount ?? 0),
                },
                permit.owner,
                permit.signature,
              ],
              account: address,
            });

            console.log("Transaction simulation successful", { request });

            // 2. Send the actual transaction
            const txHash = await walletClient.writeContract(request);
            setClaimTxHash(txHash);

            // 3. Wait for transaction receipt
            const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
            console.log("Transaction completed", { receipt });

            // Update status to success
            setPermits((prev) => prev.map((p) => (p.signature === permit.signature ? { ...p, claimStatus: "Success", status: "Claimed" } : p)));
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
      setIsClaimingSequentially(false);
      console.log("Sequential claim completed successfully");
    },
    [claimablePermits, permits, handleClaimPermit, walletClient, address, chain, publicClient, setError, setPermits]
  );

  const handleClaimBatch = useCallback(
    async (permitsToClaim?: PermitData[]) => {
      if (!walletClient || !address || !chain || !publicClient) {
        console.error("Batch RPC: Wallet not connected - client:", walletClient, "address:", address, "chain:", chain);
        setError("Wallet not connected or chain unavailable");
        return { success: false, txHash: "" };
      } else {
        console.log("Batch RPC: Wallet connection verified - address:", address, "chain id:", chain.id);
      }

      setIsClaimingSequentially(true);
      setSequentialClaimError(null);
      setError(null);

      const toClaim =
        permitsToClaim || claimablePermits || permits.filter((p) => p.status === "Valid" && p.claimStatus !== "Success" && p.claimStatus !== "Pending");

      if (!toClaim.length) {
        console.warn("Batch RPC: No claimable permits found");
        setSequentialClaimError("No claimable permits found");
        setIsClaimingSequentially(false);
        return { success: false, txHash: "" };
      }

      console.log(`Starting batch RPC for ${toClaim.length} permits`, {
        permits: toClaim.map((p) => ({
          nonce: p.nonce,
          networkId: p.networkId,
          token: p.tokenAddress,
        })),
      });

      let success = false;
      let txHash: `0x${string}` | undefined;
      try {
        // Update all permits to pending status
        setPermits((prev) => prev.map((p) => (toClaim.some((c) => c.signature === p.signature) ? { ...p, claimStatus: "Pending" } : p)));

        const { request } = await publicClient.simulateContract({
          address: NEW_PERMIT2_ADDRESS,
          abi: permit2Abi,
          functionName: "batchPermitTransferFrom",
          args: [
            toClaim.map((permit) => ({
              permitted: {
                token: permit.tokenAddress,
                amount: BigInt(permit.amount ?? 0),
              },
              nonce: BigInt(permit.nonce),
              deadline: BigInt(permit.deadline),
            })),
            toClaim.map((permit) => ({
              to: address,
              requestedAmount: BigInt(permit.amount ?? 0),
            })),
            toClaim.map((permit) => permit.owner),
            toClaim.map((permit) => permit.signature),
          ],
          account: address,
        });

        console.log("Transaction simulation successful", { request });

        // 2. Send the actual transaction
        txHash = await walletClient.writeContract(request);
        setClaimTxHash(txHash);

        // 3. Wait for transaction receipt
        const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
        console.log("Transaction completed", { receipt });

        setPermits((prev) => prev.map((p) => (toClaim.some((c) => c.signature === p.signature) ? { ...p, claimStatus: "Success", status: "Claimed" } : p)));
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
        setPermits((prev) => prev.map((p) => (toClaim.some((c) => c.signature === p.signature) ? { ...p, claimStatus: "Error" } : p)));
        setError("Batch claim failed");
      } finally {
        setIsClaimingSequentially(false);
      }
      return { success, txHash: String(txHash) };
    },
    [claimablePermits, permits, handleClaimPermit, walletClient, address, chain, publicClient, setError, setPermits]
  );

  return {
    handleClaimPermit,
    handleClaimBatch,
    handleClaimSequential,
    isClaimingSequentially,
    sequentialClaimError,
    // Removed isClaimConfirming since we use per-permit claimStatus
    claimTxHash,
    swapSubmissionStatus,
    walletConnectionError: !address || !chain ? "Wallet not connected" : null,
  };
}
