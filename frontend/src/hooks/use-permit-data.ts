import { useState, useCallback, useEffect, useRef } from "react";
import { type Address } from "viem";
import type { PermitData } from "../../../shared/types";
// Removed Supabase and library imports, worker handles them

// Get Supabase config from Vite env vars
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

interface UsePermitDataProps {
  address: Address | undefined;
  isConnected: boolean;
}

export function usePermitData({ address, isConnected }: UsePermitDataProps) {
  const [permits, setPermits] = useState<PermitData[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [initialLoadComplete, setInitialLoadComplete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const [isWorkerInitialized, setIsWorkerInitialized] = useState(false);

  // Initialize worker on mount
  useEffect(() => {
    // Ensure env vars are present
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      setError("Supabase URL or Anon Key missing in frontend environment variables.");
      console.error("Supabase URL or Anon Key missing in frontend environment variables.");
      setIsWorkerInitialized(false); // Mark as failed
      return;
    }

    // Create and initialize the worker
    workerRef.current = new Worker(new URL('../workers/permit-checker.worker.ts', import.meta.url), { type: 'module' });
    console.log("Permit checker worker created.");

    // Send initialization data
    workerRef.current.postMessage({
      type: 'INIT',
      payload: {
        supabaseUrl: SUPABASE_URL,
        supabaseAnonKey: SUPABASE_ANON_KEY
      }
    });

    // Listener for messages from worker
    workerRef.current.onmessage = (event: MessageEvent) => {
      const { type, permits: workerPermits, error: workerError } = event.data;
      console.log("Message received from worker:", type);

      if (type === 'INIT_SUCCESS') {
        console.log("Worker initialized successfully.");
        setIsWorkerInitialized(true);
      } else if (type === 'INIT_ERROR') {
        console.error("Worker initialization failed:", workerError);
        setError(`Worker initialization failed: ${workerError}`);
        setIsWorkerInitialized(false);
      } else if (type === 'PERMITS_RESULT') {
        console.log(">>> DEBUG: Received Permits from Worker:", JSON.stringify(workerPermits, null, 2));
        setPermits(workerPermits || []);
        setError(null); // Clear previous errors on success
        setIsLoading(false);
        setInitialLoadComplete(true);
      } else if (type === 'PERMITS_ERROR') {
        console.error("Worker error fetching/checking permits:", workerError);
        setError(`Error fetching permits: ${workerError}`);
        setPermits([]); // Clear permits on error
        setIsLoading(false);
        setInitialLoadComplete(true);
      }
    };

    // Error handler for worker itself
    workerRef.current.onerror = (event) => {
      console.error("Worker error:", event.message, event);
      setError(`Worker error: ${event.message}`);
      setIsLoading(false);
      setInitialLoadComplete(true);
      setIsWorkerInitialized(false);
    };

    // Cleanup worker on unmount
    return () => {
      console.log("Terminating permit checker worker.");
      workerRef.current?.terminate();
      workerRef.current = null;
      setIsWorkerInitialized(false);
    };
  }, []); // Run only once on mount

  // Fetch permits function now posts message to worker
  const fetchPermitsAndCheck = useCallback(() => {
    if (!workerRef.current) {
      setError("Worker not available.");
      console.error("fetchPermitsAndCheck called but worker is not available.");
      return;
    }
    if (!isWorkerInitialized) {
       setError("Worker not initialized yet.");
       console.warn("fetchPermitsAndCheck called before worker initialization complete.");
       // Optionally queue the request or wait, for now just return
       return;
    }

    if (!isConnected || !address) {
      setError("Wallet not connected.");
      setPermits([]);
      return;
    }

    setIsLoading(true);
    setError(null);
    console.log("Posting FETCH_PERMITS message to worker...");
    workerRef.current.postMessage({
      type: 'FETCH_PERMITS',
      payload: { address }
    });
    // Note: State updates (isLoading, permits, error) are now handled by the worker's onmessage listener
    // We don't call setIsLoading(false) or setInitialLoadComplete(true) here anymore.

  }, [address, isConnected, isWorkerInitialized]); // Add isWorkerInitialized dependency

  return {
    permits,
    setPermits, // Still needed by usePermitClaiming hook
    isLoading,
    initialLoadComplete,
    error,
    setError,
    fetchPermitsAndCheck,
  };
}
