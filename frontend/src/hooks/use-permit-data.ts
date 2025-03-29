import { useState, useCallback } from "react";
import { type Address } from "viem"; // Removed Abi import
import type { PermitData } from "../../../shared/types";
// Removed rpcHandler, readContract, preparePermitPrerequisiteContracts imports

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
      // Removed frontend balance/allowance checks
      // The backend should ideally perform these checks and include status in the response
      // For now, just set the permits fetched from the backend
      initialPermits = data.permits.map((p: PermitData) => ({ ...p, claimStatus: "Idle" }));
      setPermits(initialPermits);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An unknown error occurred during fetch");
      console.error("Error in fetchPermitsAndCheck:", err);
      setPermits([]); // Clear permits on error
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
