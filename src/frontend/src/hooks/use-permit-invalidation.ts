// use-permit-invalidation.ts: Handles permit invalidation functionality

import { useState } from "react";
import { Address, Chain, PublicClient, WalletClient, keccak256, toBytes } from "viem";
import { PERMIT3_ADDRESS } from "../constants/config.ts";
import permit3Abi from "../fixtures/permit3-abi.json";
import { PermitData } from "../types.ts";

if (!permit3Abi) {
  throw new Error("Permit3 ABI could not be loaded");
}

interface UsePermitInvalidationProps {
  publicClient: PublicClient | null;
  walletClient: WalletClient | null;
  address: Address | undefined;
  chain: Chain | null;
  onInvalidationSuccess?: (permitId: string) => void;
  onInvalidationError?: (error: string) => void;
}

interface InvalidationStatus {
  isInvalidating: boolean;
  error: string | null;
  lastInvalidatedPermitId: string | null;
}

// Function to generate permit ID from permit data
function generatePermitId(permit: PermitData): string {
  // Create permit hash based on permit signature and nonce
  const permitData = `${permit.signature}-${permit.nonce}-${permit.tokenAddress}-${permit.owner}`;
  return keccak256(toBytes(permitData));
}

// Function to simulate permit invalidation
async function simulatePermitInvalidation(
  publicClient: PublicClient,
  address: Address,
  permitId: string
) {
  return await publicClient.simulateContract({
    address: PERMIT3_ADDRESS,
    abi: permit3Abi,
    functionName: "invalidatePermit",
    args: [permitId],
    account: address,
  });
}

// Function to simulate batch permit invalidation
async function simulateBatchPermitInvalidation(
  publicClient: PublicClient,
  address: Address,
  permitIds: string[]
) {
  return await publicClient.simulateContract({
    address: PERMIT3_ADDRESS,
    abi: permit3Abi,
    functionName: "batchInvalidatePermits",
    args: [permitIds],
    account: address,
  });
}

// Function to check if a permit is already invalidated
async function isPermitInvalidated(
  publicClient: PublicClient,
  permitId: string
): Promise<boolean> {
  try {
    const result = await publicClient.readContract({
      address: PERMIT3_ADDRESS,
      abi: permit3Abi,
      functionName: "isPermitInvalidated",
      args: [permitId],
    });
    return result as boolean;
  } catch (error) {
    console.error("Failed to check permit invalidation status:", error);
    return false;
  }
}

export function usePermitInvalidation({
  publicClient,
  walletClient,
  address,
  chain,
  onInvalidationSuccess,
  onInvalidationError,
}: UsePermitInvalidationProps) {
  const [invalidationStatus, setInvalidationStatus] = useState<InvalidationStatus>({
    isInvalidating: false,
    error: null,
    lastInvalidatedPermitId: null,
  });

  const invalidatePermit = async (permit: PermitData): Promise<{ success: boolean; txHash?: string }> => {
    if (!address || !chain || !walletClient || !publicClient) {
      const error = "Wallet not connected or chain unavailable";
      setInvalidationStatus(prev => ({ ...prev, error }));
      onInvalidationError?.(error);
      return { success: false };
    }

    const permitId = generatePermitId(permit);
    
    setInvalidationStatus(prev => ({ ...prev, isInvalidating: true, error: null }));

    try {
      // Check if permit is already invalidated
      const alreadyInvalidated = await isPermitInvalidated(publicClient, permitId);
      if (alreadyInvalidated) {
        throw new Error("Permit is already invalidated");
      }

      // Simulate the transaction
      const { request } = await simulatePermitInvalidation(publicClient, address, permitId);
      console.log("Permit invalidation simulation successful", { request, permitId });

      // Send the actual transaction
      const txHash = await walletClient.writeContract(request);

      // Wait for transaction receipt
      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
      console.log("Permit invalidation completed", { receipt, permitId });
      
      if (receipt.status !== "success") {
        throw new Error(`Transaction failed with status: ${receipt.status}`);
      }

      setInvalidationStatus(prev => ({
        ...prev,
        isInvalidating: false,
        lastInvalidatedPermitId: permitId,
        error: null,
      }));
      
      onInvalidationSuccess?.(permitId);
      return { success: true, txHash };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
      console.error("Permit invalidation failed:", error);
      
      setInvalidationStatus(prev => ({
        ...prev,
        isInvalidating: false,
        error: errorMessage,
      }));
      
      onInvalidationError?.(errorMessage);
      return { success: false };
    }
  };

  const batchInvalidatePermits = async (permits: PermitData[]): Promise<{ success: boolean; txHash?: string }> => {
    if (!address || !chain || !walletClient || !publicClient) {
      const error = "Wallet not connected or chain unavailable";
      setInvalidationStatus(prev => ({ ...prev, error }));
      onInvalidationError?.(error);
      return { success: false };
    }

    if (permits.length === 0) {
      const error = "No permits to invalidate";
      setInvalidationStatus(prev => ({ ...prev, error }));
      onInvalidationError?.(error);
      return { success: false };
    }

    const permitIds = permits.map(generatePermitId);
    
    setInvalidationStatus(prev => ({ ...prev, isInvalidating: true, error: null }));

    try {
      // Check if any permits are already invalidated
      const invalidationStatuses = await Promise.all(
        permitIds.map(id => isPermitInvalidated(publicClient, id))
      );
      
      const validPermitIds = permitIds.filter((_, index) => !invalidationStatuses[index]);
      
      if (validPermitIds.length === 0) {
        throw new Error("All permits are already invalidated");
      }

      // Simulate the batch transaction
      const { request } = await simulateBatchPermitInvalidation(publicClient, address, validPermitIds);
      console.log("Batch permit invalidation simulation successful", { request, permitIds: validPermitIds });

      // Send the actual transaction
      const txHash = await walletClient.writeContract(request);

      // Wait for transaction receipt
      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
      console.log("Batch permit invalidation completed", { receipt, permitIds: validPermitIds });
      
      if (receipt.status !== "success") {
        throw new Error(`Transaction failed with status: ${receipt.status}`);
      }

      setInvalidationStatus(prev => ({
        ...prev,
        isInvalidating: false,
        lastInvalidatedPermitId: validPermitIds[validPermitIds.length - 1],
        error: null,
      }));
      
      validPermitIds.forEach(permitId => onInvalidationSuccess?.(permitId));
      return { success: true, txHash };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
      console.error("Batch permit invalidation failed:", error);
      
      setInvalidationStatus(prev => ({
        ...prev,
        isInvalidating: false,
        error: errorMessage,
      }));
      
      onInvalidationError?.(errorMessage);
      return { success: false };
    }
  };

  const checkPermitInvalidationStatus = async (permit: PermitData): Promise<boolean> => {
    if (!publicClient) {
      console.warn("Cannot check permit invalidation status: no public client");
      return false;
    }

    const permitId = generatePermitId(permit);
    return await isPermitInvalidated(publicClient, permitId);
  };

  const clearError = () => {
    setInvalidationStatus(prev => ({ ...prev, error: null }));
  };

  return {
    invalidatePermit,
    batchInvalidatePermits,
    checkPermitInvalidationStatus,
    clearError,
    isInvalidating: invalidationStatus.isInvalidating,
    error: invalidationStatus.error,
    lastInvalidatedPermitId: invalidationStatus.lastInvalidatedPermitId,
    walletConnectionError: !address || !chain ? "Wallet not connected" : null,
  };
}