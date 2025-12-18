// use-permit-claiming.ts: Handles single and batch permit claiming

import { Dispatch, SetStateAction, useState } from "react";
import { Address, Chain, PublicClient, WalletClient } from "viem";
import { NEW_PERMIT2_ADDRESS } from "../constants/config.ts";
import permit2Abi from "../fixtures/permit2-abi.ts";
import { AllowanceAndBalance, PermitData } from "../types.ts";

if (!permit2Abi) {
  throw new Error("Permit2 ABI could not be loaded");
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

async function simulatePermitTranferFrom(publicClient: PublicClient, address: Address, permit: PermitData) {
  return await publicClient.simulateContract({
    address: permit.permit2Address,
    abi: permit2Abi,
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
    address: NEW_PERMIT2_ADDRESS,
    abi: permit2Abi,
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

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function isUserRejectedRequest(error: unknown): boolean {
  if (!error) return false;

  const maybeAny = error as { code?: unknown; name?: unknown; shortMessage?: unknown; message?: unknown };
  if (maybeAny && typeof maybeAny === "object") {
    if (maybeAny.code === 4001) return true; // EIP-1193 userRejectedRequest
    if (typeof maybeAny.name === "string" && maybeAny.name.toLowerCase().includes("userrejected")) return true;
  }

  const message =
    typeof maybeAny?.shortMessage === "string"
      ? maybeAny.shortMessage
      : error instanceof Error
        ? error.message
        : typeof maybeAny?.message === "string"
          ? maybeAny.message
          : String(error);

  return /user rejected|user denied|rejected the request|denied transaction signature|request rejected|action_rejected/i.test(message);
}

async function recordClaimOnce({
  txHash,
  networkId,
}: {
  txHash: `0x${string}`;
  networkId: number;
}): Promise<{ ok: true } | { ok: false; retryable: boolean; status: number; error: string }> {
  try {
    const response = await fetch("/api/permits/record-claim", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transactionHash: txHash, networkId }),
    });

    if (response.ok) return { ok: true };

    let errorMessage = response.statusText || "Request failed";
    try {
      const json = (await response.json().catch(() => null)) as { error?: string; details?: string } | null;
      if (json?.error) {
        errorMessage = json.details ? `${json.error}: ${json.details}` : json.error;
      }
    } catch {
      // ignore JSON parse errors
    }

    const retryable =
      response.status === 404 ||
      (response.status === 400 &&
        (errorMessage.toLowerCase().includes("not mined") ||
          errorMessage.toLowerCase().includes("receipt unavailable") ||
          errorMessage.toLowerCase().includes("not found")));

    return { ok: false, retryable, status: response.status, error: errorMessage };
  } catch (error) {
    return { ok: false, retryable: true, status: 0, error: error instanceof Error ? error.message : String(error) };
  }
}

async function recordClaimWithRetries({
  txHash,
  networkId,
  maxAttempts = 6,
}: {
  txHash: `0x${string}`;
  networkId: number;
  maxAttempts?: number;
}): Promise<{ ok: true; attempts: number } | { ok: false; attempts: number; lastError: string }> {
  let delayMs = 1_000;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const res = await recordClaimOnce({ txHash, networkId });
    if (res.ok) return { ok: true, attempts: attempt };
    if (!res.retryable) return { ok: false, attempts: attempt, lastError: res.error };
    await sleep(delayMs);
    delayMs = Math.min(delayMs * 2, 15_000);
  }

  return { ok: false, attempts: maxAttempts, lastError: "record-claim retries exhausted" };
}

export function usePermitClaiming({
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

    let txHash: `0x${string}` | undefined;
    try {
      // 1. First simulate the transaction
      if (!permit2Abi) {
        throw new Error("Permit2 ABI not found - cannot simulate transaction");
      }

      const { request } = await simulatePermitTranferFrom(publicClient, address, permit);

      console.log("Transaction simulation successful", { request });

      // 2. Send the actual transaction
      txHash = await walletClient.writeContract(request);
      setPermits((prev) => prev.map((p) => (p.signature === permit.signature ? { ...p, claimStatus: "Pending", transactionHash: txHash } : p)));
      updatePermitStatusCache(permit.signature, { claimStatus: "Pending", transactionHash: txHash });

      // 3. Wait for transaction receipt
      let receipt: Awaited<ReturnType<typeof publicClient.waitForTransactionReceipt>> | null = null;
      try {
        receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
        console.log("Transaction completed", { receipt });
      } catch (error) {
        console.warn("Receipt lookup failed after tx submission; will attempt to record via API", { error, txHash, networkId: permit.networkId });
      }

      if (!receipt) {
        setError(`Claim tx submitted but confirmation failed. Check explorer: ${txHash}`);
        void recordClaimWithRetries({ txHash, networkId: permit.networkId }).then((result) => {
          if (!result.ok) {
            console.warn("record-claim did not succeed after retries", { txHash, networkId: permit.networkId, ...result });
            return;
          }

          setPermits((prev) =>
            prev.map((p) => (p.signature === permit.signature ? { ...p, claimStatus: "Success", status: "Claimed", transactionHash: txHash } : p))
          );
          updatePermitStatusCache(permit.signature, { status: "Claimed", transactionHash: txHash });
          reduceAllowance([permit]);
          setError(null);
        });
        return { success: true, txHash };
      }

      if (receipt.status !== "success") throw new Error(`Transaction failed with status: ${receipt.status}`);

      // Update status to success
      setPermits((prev) =>
        prev.map((p) => (p.signature === permit.signature ? { ...p, claimStatus: "Success", status: "Claimed", transactionHash: txHash } : p))
      );
      updatePermitStatusCache(permit.signature, { status: "Claimed", transactionHash: txHash });
      reduceAllowance([permit]);

      // Record transaction in database
      void recordClaimWithRetries({ txHash, networkId: permit.networkId }).then((result) => {
        if (!result.ok) console.warn("Failed to record claim after retries", { txHash, networkId: permit.networkId, ...result });
      });

      return { success: true, txHash };
    } catch (error) {
      if (isUserRejectedRequest(error)) {
        setPermits((prev) => prev.map((p) => (p.signature === permit.signature ? { ...p, claimStatus: "Idle" } : p)));
        return { success: false, txHash: "" };
      }

      const errorMessage = error instanceof Error ? error.message : String(error);
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

      if (txHash) {
        if (errorMessage.includes("Transaction failed with status")) {
          setPermits((prev) => prev.map((p) => (p.signature === permit.signature ? { ...p, claimStatus: "Error", transactionHash: txHash } : p)));
          return { success: false, txHash };
        }

        setPermits((prev) => prev.map((p) => (p.signature === permit.signature ? { ...p, claimStatus: "Pending", transactionHash: txHash } : p)));
        setError(`Claim tx submitted but confirmation failed. Check explorer: ${txHash}`);
        void recordClaimWithRetries({ txHash, networkId: permit.networkId }).then((result) => {
          if (!result.ok) console.warn("Failed to record claim after retries", { txHash, networkId: permit.networkId, ...result });
        });
        return { success: true, txHash };
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
        let txHash: `0x${string}` | undefined;
        try {
          const { request } = await simulatePermitTranferFrom(publicClient, address, permit);

          console.log("Transaction simulation successful", { request });

          // 2. Send the actual transaction
          txHash = await walletClient.writeContract(request);
          setPermits((prev) => prev.map((p) => (p.signature === permit.signature ? { ...p, claimStatus: "Pending", transactionHash: txHash } : p)));
          updatePermitStatusCache(permit.signature, { claimStatus: "Pending", transactionHash: txHash });

          // 3. Wait for transaction receipt
          let receipt: Awaited<ReturnType<typeof publicClient.waitForTransactionReceipt>> | null = null;
          try {
            receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
            console.log("Transaction completed", { receipt });
          } catch (error) {
            console.warn("Receipt lookup failed after tx submission; will attempt to record via API", { error, txHash, networkId: permit.networkId });
          }

          if (!receipt) {
            void recordClaimWithRetries({ txHash, networkId: permit.networkId }).then((result) => {
              if (!result.ok) {
                console.warn("Failed to record claim after retries", { txHash, networkId: permit.networkId, ...result });
                return;
              }

              setPermits((prev) =>
                prev.map((p) => (p.signature === permit.signature ? { ...p, claimStatus: "Success", status: "Claimed", transactionHash: txHash } : p))
              );
              updatePermitStatusCache(permit.signature, { status: "Claimed", transactionHash: txHash });
              reduceAllowance([permit]);
            });
            return;
          }

          if (receipt.status !== "success") throw new Error(`Transaction failed with status: ${receipt.status}`);

          // Update status to success
          successfullyClaimedPermits.push(permit);
          setPermits((prev) =>
            prev.map((p) => (p.signature === permit.signature ? { ...p, claimStatus: "Success", status: "Claimed", transactionHash: txHash } : p))
          );
          updatePermitStatusCache(permit.signature, { status: "Claimed", transactionHash: txHash });

          // Record transaction in database
          void recordClaimWithRetries({ txHash, networkId: permit.networkId }).then((result) => {
            if (!result.ok) console.warn("Failed to record claim after retries", { txHash, networkId: permit.networkId, ...result });
          });
        } catch (error) {
          if (isUserRejectedRequest(error) && !txHash) {
            setPermits((prev) => prev.map((p) => (p.signature === permit.signature ? { ...p, claimStatus: "Idle" } : p)));
            return;
          }

          const errorMessage = error instanceof Error ? error.message : String(error);
          console.error("Sequential claim processing error", { error });
          if (txHash) {
            if (errorMessage.includes("Transaction failed with status")) {
              setPermits((prev) => prev.map((p) => (p.signature === permit.signature ? { ...p, claimStatus: "Error", transactionHash: txHash } : p)));
              return;
            }

            setPermits((prev) => prev.map((p) => (p.signature === permit.signature ? { ...p, claimStatus: "Pending", transactionHash: txHash } : p)));
            void recordClaimWithRetries({ txHash, networkId: permit.networkId }).then((result) => {
              if (!result.ok) console.warn("Failed to record claim after retries", { txHash, networkId: permit.networkId, ...result });
            });
            return;
          }

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
    const networkIds = new Set(permitsToClaim.map((permit) => permit.networkId));
    const batchNetworkId = networkIds.size === 1 ? permitsToClaim[0].networkId : null;
    try {
      // Update all permits to pending status
      setPermits((prev) => prev.map((p) => (permitsToClaim.some((c) => c.signature === p.signature) ? { ...p, claimStatus: "Pending" } : p)));

      const { request } = await simulateBatchPermitTransferFrom(publicClient, address, permitsToClaim);

      console.log("Transaction simulation successful", { request });

      // 2. Send the actual transaction
      txHash = await walletClient.writeContract(request);
      setPermits((prev) =>
        prev.map((p) => (permitsToClaim.some((c) => c.signature === p.signature) ? { ...p, claimStatus: "Pending", transactionHash: txHash } : p))
      );
      permitsToClaim.forEach((permit) => updatePermitStatusCache(permit.signature, { claimStatus: "Pending", transactionHash: String(txHash) }));

      // 3. Wait for transaction receipt
      let receipt: Awaited<ReturnType<typeof publicClient.waitForTransactionReceipt>> | null = null;
      try {
        receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
        console.log("Transaction completed", { receipt });
      } catch (error) {
        console.warn("Receipt lookup failed after tx submission; will attempt to record via API", { error, txHash, networkId: batchNetworkId });
      }

      if (!receipt) {
        if (!batchNetworkId) {
          console.error("Batch claim expects all permits to share the same networkId");
          setError("Batch claim submitted but could not be recorded (network mismatch).");
        } else {
          setError(`Batch claim tx submitted but confirmation failed. Check explorer: ${txHash}`);
          void recordClaimWithRetries({ txHash, networkId: batchNetworkId }).then((result) => {
            if (!result.ok) {
              console.warn("Failed to record batch claim after retries", { txHash, networkId: batchNetworkId, ...result });
              return;
            }
            setPermits((prev) =>
              prev.map((p) =>
                permitsToClaim.some((c) => c.signature === p.signature) ? { ...p, claimStatus: "Success", status: "Claimed", transactionHash: txHash } : p
              )
            );
            reduceAllowance(permitsToClaim);
            permitsToClaim.forEach((permit) => updatePermitStatusCache(permit.signature, { status: "Claimed", transactionHash: String(txHash) }));
            setError(null);
          });
        }

        success = true;
        return { success, txHash: String(txHash) };
      }

      if (receipt.status !== "success") throw new Error(`Transaction failed with status: ${receipt.status}`);

      setPermits((prev) =>
        prev.map((p) =>
          permitsToClaim.some((c) => c.signature === p.signature) ? { ...p, claimStatus: "Success", status: "Claimed", transactionHash: txHash } : p
        )
      );
      reduceAllowance(permitsToClaim);
      permitsToClaim.forEach((permit) => {
        updatePermitStatusCache(permit.signature, { status: "Claimed", transactionHash: String(txHash) });
      });

      if (!batchNetworkId) {
        console.error("Batch claim expects all permits to share the same networkId");
      } else {
        void recordClaimWithRetries({ txHash, networkId: batchNetworkId }).then((result) => {
          if (!result.ok) console.warn("Failed to record batch claim after retries", { txHash, networkId: batchNetworkId, ...result });
        });
      }

      console.log("Batch RPC completed");
      success = true;
    } catch (error) {
      if (isUserRejectedRequest(error) && !txHash) {
        setPermits((prev) => prev.map((p) => (permitsToClaim.some((c) => c.signature === p.signature) ? { ...p, claimStatus: "Idle" } : p)));
        return { success: false, txHash: "" };
      }

      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error("Batch RPC: Unhandled processing error", {
        error,
        context: "batch-processing",
      });
      if (txHash && batchNetworkId) {
        if (errorMessage.includes("Transaction failed with status")) {
          setPermits((prev) =>
            prev.map((p) => (permitsToClaim.some((c) => c.signature === p.signature) ? { ...p, claimStatus: "Error", transactionHash: txHash } : p))
          );
          setError(`Batch claim reverted. Check explorer: ${txHash}`);
        } else {
          setPermits((prev) =>
            prev.map((p) => (permitsToClaim.some((c) => c.signature === p.signature) ? { ...p, claimStatus: "Pending", transactionHash: txHash } : p))
          );
          setError(`Batch claim tx submitted but confirmation failed. Check explorer: ${txHash}`);
          void recordClaimWithRetries({ txHash, networkId: batchNetworkId }).then((result) => {
            if (!result.ok) console.warn("Failed to record batch claim after retries", { txHash, networkId: batchNetworkId, ...result });
          });
        }
      } else {
        setPermits((prev) => prev.map((p) => (permitsToClaim.some((c) => c.signature === p.signature) ? { ...p, claimStatus: "Error" } : p)));
        setError("Batch claim failed. Claim each permit individually.");
      }
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
