import { useState, useCallback } from "react";
import { type Address, type Abi } from "viem";
import type { PermitData } from "../../../shared/types";
import { rpcHandler } from "../main"; // Assuming rpcHandler is exported from main.tsx
import { readContract } from "@pavlovcik/permit2-rpc-manager";
import { preparePermitPrerequisiteContracts } from "../utils/permit-utils";

const BACKEND_API_URL = import.meta.env.VITE_BACKEND_API_URL || "http://localhost:8000";

interface UsePermitDataProps {
  address: Address | undefined;
  isConnected: boolean;
}

export function usePermitData({ address, isConnected }: UsePermitDataProps) {
  const [permits, setPermits] = useState<PermitData[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [initialLoadComplete, setInitialLoadComplete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchPermitsAndCheck = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    // Clear sequential claim error - This state will be managed by the claiming hook
    // setSequentialClaimError(null);
    console.log("Fetching permits from backend API...");
    if (!isConnected || !address) {
      setError("Wallet not connected.");
      setIsLoading(false);
      setInitialLoadComplete(true);
      setPermits([]); // Clear permits if not connected
      return;
    }

    let initialPermits: PermitData[] = [];
    try {
      const response = await fetch(`${BACKEND_API_URL}/api/permits?walletAddress=${address}`, { headers: { Accept: "application/json" } });
      if (!response.ok) {
        let errorMsg = `Failed to fetch permits for wallet ${address}: ${response.status} ${response.statusText}`;
        try {
          const errorData = await response.json();
          errorMsg = errorData.error || errorMsg;
        } catch {
          /* Ignore */
        }
        throw new Error(errorMsg);
      }
      const data = await response.json();
      if (!data || !Array.isArray(data.permits)) {
        throw new Error("Received invalid data format for permits.");
      }
      initialPermits = data.permits.map((p: PermitData) => ({ ...p, claimStatus: "Idle" }));

      // Use readContract for checks
      const checkedPermitsMap = new Map<string, Partial<PermitData>>();
      const checkPromises = initialPermits
        .filter((permit) => permit.type === "erc20-permit" && permit.token?.address && permit.amount && permit.owner && permit.networkId)
        .flatMap((permit) => {
          const calls = preparePermitPrerequisiteContracts(permit);
          if (!calls) return [];

          const key = `${permit.nonce}-${permit.networkId}`;
          const requiredAmount = BigInt(permit.amount!);
          const chainId = permit.networkId!;

          const balanceCall = calls[0];
          const allowanceCall = calls[1];

          const balancePromise = readContract<bigint>({
            handler: rpcHandler,
            chainId: chainId,
            address: balanceCall.address,
            abi: balanceCall.abi as Abi,
            functionName: balanceCall.functionName,
            args: balanceCall.args,
          }).then((balance) => ({ key, type: "balance", result: balance, requiredAmount }))
            .catch((error) => ({ key, type: "balance", error }));

          const allowancePromise = readContract<bigint>({
            handler: rpcHandler,
            chainId: chainId,
            address: allowanceCall.address,
            abi: allowanceCall.abi as Abi,
            functionName: allowanceCall.functionName,
            args: allowanceCall.args,
          }).then((allowance) => ({ key, type: "allowance", result: allowance, requiredAmount }))
            .catch((error) => ({ key, type: "allowance", error }));

          return [balancePromise, allowancePromise];
        });

      const settledResults = await Promise.allSettled(checkPromises);

      settledResults.forEach((settledResult) => {
        if (settledResult.status === "fulfilled") {
          const value = settledResult.value;
          const updateData = checkedPermitsMap.get(value.key) || {};

          if ('error' in value) {
            console.warn(`Prereq check failed for permit ${value.key} (${value.type}):`, value.error);
            updateData.checkError = `Check failed (${value.type}).`;
          } else {
            if (value.type === "balance") {
              updateData.ownerBalanceSufficient = BigInt(value.result) >= value.requiredAmount;
            } else if (value.type === "allowance") {
              updateData.permit2AllowanceSufficient = BigInt(value.result) >= value.requiredAmount;
            }
          }
          checkedPermitsMap.set(value.key, updateData);
        } else {
          console.error("Prereq check promise rejected:", settledResult.reason);
          // Cannot reliably update map without key/type
        }
      });
      const finalCheckedPermits = initialPermits.map((permit) => {
        const key = `${permit.nonce}-${permit.networkId}`;
        const checkData = checkedPermitsMap.get(key);
        return checkData ? { ...permit, ...checkData } : permit;
      });
      setPermits(finalCheckedPermits);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An unknown error occurred during fetch/check");
      console.error("Error in fetchPermitsAndCheck:", err);
      if (initialPermits.length > 0 && permits.length === 0) {
        // If fetch succeeded but checks failed catastrophically, show initial permits with error
        setPermits(initialPermits.map((p) => ({ ...p, checkError: "Checks failed." })));
      } else if (initialPermits.length === 0) {
        // If fetch failed entirely, ensure permits are empty
        setPermits([]);
      }
    } finally {
      setIsLoading(false);
      setInitialLoadComplete(true);
    }
  }, [address, isConnected]); // Dependencies for useCallback

  return {
    permits,
    setPermits, // Expose setPermits for the claiming hook to update status
    isLoading,
    initialLoadComplete,
    error,
    setError, // Export the error setter
    fetchPermitsAndCheck,
  };
}
