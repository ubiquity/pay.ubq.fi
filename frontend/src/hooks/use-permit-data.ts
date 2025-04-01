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
  const [isLoading, setIsLoading] = useState(true); // Start in loading state
  // Removed unused state: const [initialLoadComplete, setInitialLoadComplete] = useState(false);
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
      setIsLoading(false); // Stop loading on init error
      return;
    }

    workerRef.current = new Worker(new URL('../workers/permit-checker.worker.ts', import.meta.url), { type: 'module' });
    console.log("Permit checker worker created.");

    workerRef.current.postMessage({
      type: 'INIT',
      payload: { supabaseUrl: SUPABASE_URL, supabaseAnonKey: SUPABASE_ANON_KEY }
    });

    workerRef.current.onmessage = (event: MessageEvent) => {
      // Define a type for the worker message data
      type WorkerMessageData = {
          type: 'INIT_SUCCESS' | 'INIT_ERROR' | 'ALL_PERMITS_RESULT' | 'VALIDATION_RESULT' | 'PERMITS_ERROR';
          permits?: PermitData[];
          error?: string;
      };
      const { type, permits: workerPermits, error: workerError } = event.data as WorkerMessageData;
      console.log("Message received from worker:", type);

      switch (type) {
        case 'INIT_SUCCESS':
          console.log("Worker initialized successfully.");
          setIsWorkerInitialized(true);
          // Note: Loading state remains true until fetch is triggered and completes
          break;
        case 'INIT_ERROR':
          console.error("Worker initialization failed:", workerError);
          setError(`Worker initialization failed: ${workerError}`);
          setIsWorkerInitialized(false);
          setIsLoading(false); // Stop loading on init error
          break;
        case 'ALL_PERMITS_RESULT': {
          // setIsLoading(true); // Keep loading true, validation might follow
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

            if (cachedStatus) {
              permitToStore = { ...dbPermit, ...cachedStatus };
            } else {
              permitToStore = { ...dbPermit };
            }
            currentPermitMap.set(key, permitToStore);

            // Explicitly type dbPermit before accessing created_at
            const permitWithTimestamp = dbPermit as PermitData & { created_at?: string };
            const createdAt = permitWithTimestamp.created_at;
            const needsValidation = !cachedStatus || (lastCheckTimestamp && createdAt && new Date(createdAt) > new Date(lastCheckTimestamp));

            if (needsValidation) {
              permitsToValidate.push(dbPermit);
            }
          });

          allPermitsRef.current = currentPermitMap;
          applyFinalFilter(allPermitsRef.current); // Update UI immediately
          // Removed: setInitialLoadComplete(true); // DB load is done

          if (permitsToValidate.length > 0) {
            console.log(`Sending ${permitsToValidate.length} permits to worker for validation.`);
            workerRef.current?.postMessage({ type: 'VALIDATE_PERMITS', payload: { permits: permitsToValidate } });
            // Keep isLoading = true
          } else {
            console.log("No new permits require validation.");
            setIsLoading(false); // Stop loading ONLY if no validation needed
             try {
                localStorage.setItem(PERMIT_LAST_CHECK_TIMESTAMP_KEY, new Date().toISOString());
             } catch (e) { console.error("Failed to save timestamp", e); }
          }
          break;
        }
        case 'VALIDATION_RESULT': {
          const validatedPermits: PermitData[] = workerPermits || [];
          const currentCache = loadCache();
          let cacheUpdated = false;

          validatedPermits.forEach(validatedPermit => {
            const key = `${validatedPermit.nonce}-${validatedPermit.networkId}`;
            const existingPermit = allPermitsRef.current.get(key);
            if (existingPermit) {
              const updatedPermit = { ...existingPermit, ...validatedPermit };
              allPermitsRef.current.set(key, updatedPermit);
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
          try {
            localStorage.setItem(PERMIT_LAST_CHECK_TIMESTAMP_KEY, new Date().toISOString());
            console.log("Saved last check timestamp to localStorage after validation.");
          } catch (e) { console.error("Failed to save timestamp", e); }

          applyFinalFilter(allPermitsRef.current); // Re-apply filter
          setIsLoading(false); // Validation complete, stop loading
          break;
        }
        case 'PERMITS_ERROR':
          console.error("Worker error processing permits:", workerError);
          setError(`Error processing permits: ${workerError}`);
          allPermitsRef.current.clear();
          setDisplayPermits([]);
          setIsLoading(false); // Stop loading on error
          // Removed: setInitialLoadComplete(true);
          break;
      }
    };

    workerRef.current.onerror = (event) => {
      console.error("Worker error:", event.message, event);
      setError(`Worker error: ${event.message}`);
      setIsLoading(false); // Stop loading on worker error
      // Removed: setInitialLoadComplete(true);
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
      // setError("Worker not available."); // Avoid setting error if just not ready
      console.error("fetchPermitsAndCheck called but worker is not available.");
       return;
     }
     if (!isWorkerInitialized) {
       console.warn("fetchPermitsAndCheck called before worker initialization complete.");
       return;
    }
    if (!isConnected || !address) {
      allPermitsRef.current.clear();
      setDisplayPermits([]);
      setIsLoading(false); // Ensure loading stops if disconnected before fetch
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
    // Removed: initialLoadComplete,
     error,
     setError,
     fetchPermitsAndCheck,
     isWorkerInitialized,
     updatePermitStatusCache // Expose cache update function
   };
 }
