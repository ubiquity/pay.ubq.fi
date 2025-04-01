import { useState, useCallback, useEffect, useRef } from "react";
import { type Address } from "viem";
import type { PermitData } from "../types";

// Constants
const PERMIT_LAST_CHECK_TIMESTAMP_KEY = "permitLastCheckTimestamp";
const PERMIT_STATUS_CACHE_KEY = "permitStatusCache";

// Type for cached status
type CachedPermitStatus = Pick<PermitData, 'isNonceUsed' | 'checkError' | 'ownerBalanceSufficient' | 'permit2AllowanceSufficient'>;

// Get Supabase config from Vite env vars
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

interface UsePermitDataProps {
  address: Address | undefined;
  isConnected: boolean;
}

export function usePermitData({ address, isConnected }: UsePermitDataProps) {
  // Main state holding potentially filtered permits for UI display
  const [displayPermits, setDisplayPermits] = useState<PermitData[]>([]);
  // Ref to hold the *complete* list of permits (including those fetched but maybe filtered later) and their statuses
  const allPermitsRef = useRef<Map<string, PermitData>>(new Map());
  const [isLoading, setIsLoading] = useState(false);
  const [initialLoadComplete, setInitialLoadComplete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const [isWorkerInitialized, setIsWorkerInitialized] = useState(false);

  // Function to load cache from localStorage
  const loadCache = useCallback((): Record<string, CachedPermitStatus> => {
    try {
      const cached = localStorage.getItem(PERMIT_STATUS_CACHE_KEY);
      return cached ? JSON.parse(cached) : {};
    } catch (e) {
      console.error("Failed to load permit status cache", e);
      return {};
    }
  }, []);

  // Function to save cache to localStorage
  const saveCache = useCallback((cache: Record<string, CachedPermitStatus>) => {
    try {
      localStorage.setItem(PERMIT_STATUS_CACHE_KEY, JSON.stringify(cache));
    } catch (e) {
      console.error("Failed to save permit status cache", e);
    }
  }, []);

   // Function to apply final filtering for UI display
   const applyFinalFilter = useCallback((permitsMap: Map<string, PermitData>) => {
    const filteredList: PermitData[] = [];
    permitsMap.forEach(permit => {
        // Filter if nonce is used OR if the nonce check specifically failed
        const nonceCheckFailed = !!(permit.checkError && permit.checkError.toLowerCase().includes("nonce"));
        const shouldFilter = permit.isNonceUsed === true || nonceCheckFailed;
        if (!shouldFilter) {
            filteredList.push(permit);
        }
    });
    setDisplayPermits(filteredList);
  }, []);


  // Initialize worker on mount
  useEffect(() => {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      setError("Supabase URL or Anon Key missing in frontend environment variables.");
      console.error("SupABASE URL or Anon Key missing"); // Keep console concise
      setIsWorkerInitialized(false);
      return;
    }

    workerRef.current = new Worker(new URL('../workers/permit-checker.worker.ts', import.meta.url), { type: 'module' });
    console.log("Permit checker worker created.");

    workerRef.current.postMessage({
      type: 'INIT',
      payload: { supabaseUrl: SUPABASE_URL, supabaseAnonKey: SUPABASE_ANON_KEY }
    });

    workerRef.current.onmessage = (event: MessageEvent) => {
      const { type, permits: workerPermits, error: workerError } = event.data;
      console.log("Message received from worker:", type);

      switch (type) {
        case 'INIT_SUCCESS':
          console.log("Worker initialized successfully.");
          setIsWorkerInitialized(true);
          break;
        case 'INIT_ERROR':
          console.error("Worker initialization failed:", workerError);
          setError(`Worker initialization failed: ${workerError}`);
          setIsWorkerInitialized(false);
          break;
        case 'ALL_PERMITS_RESULT': { // Worker returns all permits from DB
          setIsLoading(true); // Start loading phase for validation
          const allPermitsFromDb: PermitData[] = workerPermits || [];
          const cachedStatuses = loadCache();
          const currentPermitMap = new Map<string, PermitData>();
          const permitsToValidate: PermitData[] = [];
          let lastCheckTimestamp: string | null = null;
          try {
            lastCheckTimestamp = localStorage.getItem(PERMIT_LAST_CHECK_TIMESTAMP_KEY);
          } catch (e) { console.error("Failed to read timestamp", e); }

          allPermitsFromDb.forEach(dbPermit => {
            const key = `${dbPermit.nonce}-${dbPermit.networkId}`;
            const cachedStatus = cachedStatuses[key];
            let permitToStore: PermitData;

            // Merge with cached status if available
            if (cachedStatus) {
              permitToStore = { ...dbPermit, ...cachedStatus };
            } else {
              permitToStore = { ...dbPermit }; // No cached status
            }
            currentPermitMap.set(key, permitToStore);

            // Decide if validation is needed (new or uncached)
            // Need 'created_at' from DB query result to compare with timestamp
            // Assuming dbPermit has a 'created_at' field for now
            const createdAt = (dbPermit as any).created_at; // Adjust if field name differs
            const needsValidation = !cachedStatus || (lastCheckTimestamp && createdAt && new Date(createdAt) > new Date(lastCheckTimestamp));

            if (needsValidation) {
              permitsToValidate.push(dbPermit); // Send original DB data for validation
            }
          });

          allPermitsRef.current = currentPermitMap; // Update ref with merged data
          applyFinalFilter(allPermitsRef.current); // Update UI immediately with cached statuses
          setInitialLoadComplete(true); // Mark initial load (from DB) as complete

          if (permitsToValidate.length > 0) {
            console.log(`Sending ${permitsToValidate.length} permits to worker for validation.`);
            workerRef.current?.postMessage({ type: 'VALIDATE_PERMITS', payload: { permits: permitsToValidate } });
          } else {
            console.log("No new permits require validation.");
            setIsLoading(false); // No validation needed, stop loading
             // Save timestamp even if no validation needed, to mark this check time
             try {
                localStorage.setItem(PERMIT_LAST_CHECK_TIMESTAMP_KEY, new Date().toISOString());
             } catch (e) { console.error("Failed to save timestamp", e); }
          }
          break;
        }
        case 'VALIDATION_RESULT': { // Worker returns validation results for the subset
          const validatedPermits: PermitData[] = workerPermits || [];
          const currentCache = loadCache(); // Load again in case it changed
          let cacheUpdated = false;

          validatedPermits.forEach(validatedPermit => {
            const key = `${validatedPermit.nonce}-${validatedPermit.networkId}`;
            const existingPermit = allPermitsRef.current.get(key);
            if (existingPermit) {
              // Update the permit in the ref map
              const updatedPermit = { ...existingPermit, ...validatedPermit };
              allPermitsRef.current.set(key, updatedPermit);

              // Update the cache entry
              currentCache[key] = {
                isNonceUsed: updatedPermit.isNonceUsed,
                checkError: updatedPermit.checkError,
                ownerBalanceSufficient: updatedPermit.ownerBalanceSufficient,
                permit2AllowanceSufficient: updatedPermit.permit2AllowanceSufficient
              };
              cacheUpdated = true;
            }
          });

          if (cacheUpdated) {
            saveCache(currentCache);
          }
          // Save the timestamp of this successful validation cycle
          try {
            localStorage.setItem(PERMIT_LAST_CHECK_TIMESTAMP_KEY, new Date().toISOString());
            console.log("Saved last check timestamp to localStorage after validation.");
          } catch (e) { console.error("Failed to save timestamp", e); }

          applyFinalFilter(allPermitsRef.current); // Re-apply filter with new validation results
          setIsLoading(false); // Validation complete
          break;
        }
        case 'PERMITS_ERROR': // Handles errors from both fetch and validate steps
          console.error("Worker error processing permits:", workerError);
          setError(`Error processing permits: ${workerError}`);
          // Don't clear permits, keep potentially stale data? Or clear? Let's clear for now.
          allPermitsRef.current.clear();
          setDisplayPermits([]);
          setIsLoading(false);
          setInitialLoadComplete(true); // Mark load as complete even on error
          break;
      }
    };

    workerRef.current.onerror = (event) => {
      console.error("Worker error:", event.message, event);
      setError(`Worker error: ${event.message}`);
      setIsLoading(false);
      setInitialLoadComplete(true);
      setIsWorkerInitialized(false);
    };

    return () => {
      console.log("Terminating permit checker worker.");
      workerRef.current?.terminate();
      workerRef.current = null;
      setIsWorkerInitialized(false);
    };
  }, [applyFinalFilter, loadCache, saveCache]); // Add dependencies

  // Function to fetch permits (initiates the process)
  const fetchPermitsAndCheck = useCallback(() => {
    if (!workerRef.current) {
      setError("Worker not available.");
      console.error("fetchPermitsAndCheck called but worker is not available.");
       return;
     }
     if (!isWorkerInitialized) {
       console.warn("fetchPermitsAndCheck called before worker initialization complete.");
       return;
    }
    if (!isConnected || !address) {
      // setError("Wallet not connected."); // Avoid setting error here, let UI handle disconnected state
      allPermitsRef.current.clear(); // Clear data if disconnected
      setDisplayPermits([]);
      return;
    }

    setIsLoading(true); // Set loading true at the start of the fetch process
    setError(null);

    console.log(`Posting FETCH_ALL_PERMITS message to worker...`);
    workerRef.current.postMessage({ type: 'FETCH_ALL_PERMITS', payload: { address } });

  }, [address, isConnected, isWorkerInitialized]);

  // Function to manually update the status cache (e.g., after a successful claim)
  const updatePermitStatusCache = useCallback((permitKey: string, status: Partial<CachedPermitStatus>) => {
      const currentCache = loadCache();
      currentCache[permitKey] = { ...currentCache[permitKey], ...status };
      saveCache(currentCache);
      // Optionally update the ref map as well for immediate UI reflection before next fetch cycle
      const existingPermit = allPermitsRef.current.get(permitKey);
      if (existingPermit) {
          allPermitsRef.current.set(permitKey, { ...existingPermit, ...status });
          applyFinalFilter(allPermitsRef.current); // Re-filter display list
      }
  }, [loadCache, saveCache, applyFinalFilter]);


  return {
    permits: displayPermits, // Expose the filtered list for display
    setPermits: setDisplayPermits, // Allow external updates (though cache update is preferred)
    isLoading,
    initialLoadComplete,
     error,
     setError,
     fetchPermitsAndCheck,
     isWorkerInitialized,
     updatePermitStatusCache // Expose cache update function
   };
 }
