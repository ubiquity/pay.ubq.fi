import { useState, useCallback, useEffect, useRef } from "react";
import { type Address } from "viem";
import type { PermitData } from "../types";

// Constants
const PERMIT_LAST_CHECK_TIMESTAMP_KEY = "permitLastCheckTimestamp";
const PERMIT_DATA_CACHE_KEY = "permitDataCache"; // Changed cache key

// Type for cached status - Now caching full PermitData
// type CachedPermitStatus = Pick<PermitData, 'isNonceUsed' | 'checkError' | 'ownerBalanceSufficient' | 'permit2AllowanceSufficient'>;
type PermitDataCache = Record<string, PermitData>; // Cache now stores full PermitData objects

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
  // Ref to hold the *complete* map of permits from cache + new results
  const allPermitsRef = useRef<Map<string, PermitData>>(new Map());
  const [isLoading, setIsLoading] = useState(true); // Start in loading state
  // Removed unused state: const [initialLoadComplete, setInitialLoadComplete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const [isWorkerInitialized, setIsWorkerInitialized] = useState(false);

  // Function to load PermitData cache from localStorage
  const loadCache = useCallback((): PermitDataCache => {
    try {
      const cachedString = localStorage.getItem(PERMIT_DATA_CACHE_KEY);
      console.log(`Loaded cache string for ${PERMIT_DATA_CACHE_KEY}: ${cachedString ? cachedString.substring(0, 100) + '...' : 'null'}`);
      const cachedData = cachedString ? JSON.parse(cachedString) : {};

      // Log any cached permits marked as used
      Object.entries(cachedData).forEach(([key, permit]) => {
        // Type assertion needed here as JSON.parse returns any
        if ((permit as PermitData).isNonceUsed === true) {
          console.log(`loadCache: Found cached permit ${key} with isNonceUsed=true.`);
        }
      });

      return cachedData;
    } catch (e) {
      console.error("Failed to load permit data cache", e);
      return {};
    }
  }, []);

  // Function to save PermitData cache to localStorage
  const saveCache = useCallback((cache: PermitDataCache) => {
    try {
      const cacheString = JSON.stringify(cache);
      localStorage.setItem(PERMIT_DATA_CACHE_KEY, cacheString);
      console.log(`Saved cache for ${PERMIT_DATA_CACHE_KEY}: ${cacheString.substring(0,100)}...`); // Log cache save
    } catch (e) {
      console.error("Failed to save permit data cache", e);
    }
  }, []);

   // Function to apply final filtering for UI display
   const applyFinalFilter = useCallback((permitsMap: Map<string, PermitData>) => {
    const filteredList: PermitData[] = [];
    permitsMap.forEach(permit => {
        // Filter if nonce is used OR if the nonce check specifically failed
        const nonceCheckFailed = !!(permit.checkError && permit.checkError.toLowerCase().includes("nonce"));
        const shouldFilter = permit.isNonceUsed === true || nonceCheckFailed;

        // Add detailed logging for the filtering decision
        const permitKey = `${permit.nonce}-${permit.networkId}`;
        console.log(`applyFinalFilter: Checking permit ${permitKey}. isNonceUsed=${permit.isNonceUsed}, nonceCheckFailed=${nonceCheckFailed}, shouldFilter=${shouldFilter}`);

        if (!shouldFilter) {
            filteredList.push(permit);
        } else {
             console.log(`applyFinalFilter: Filtering out permit ${permitKey}.`);
        }
    });
    console.log(`applyFinalFilter: Filtered list size: ${filteredList.length}. Setting display permits.`);
    // Log the permits *being set* to the state, focusing on nonce and used status
    console.log('applyFinalFilter: Filtered permits being set:', JSON.stringify(filteredList.map(p => ({ nonce: p.nonce, isNonceUsed: p.isNonceUsed }))));
    setDisplayPermits(filteredList);
  }, []);


  // Initialize worker on mount
  useEffect(() => {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      setError("Supabase URL or Anon Key missing in frontend environment variables.");
      console.error("SupABASE URL or Anon Key missing");
      setIsWorkerInitialized(false);
      setIsLoading(false);
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
          type: 'INIT_SUCCESS' | 'INIT_ERROR' | 'NEW_PERMITS_VALIDATED' | 'PERMITS_ERROR'; // Adjusted message types
          permits?: PermitData[]; // Used for NEW_PERMITS_VALIDATED
          error?: string;
      };
      const { type, permits: workerPermits, error: workerError } = event.data as WorkerMessageData;
      console.log("Message received from worker:", type);

      switch (type) {
        case 'INIT_SUCCESS':
          console.log("Worker initialized successfully.");
          setIsWorkerInitialized(true);
          // Trigger initial fetch now that worker is ready
          fetchPermitsAndCheck();
          break;
        case 'INIT_ERROR':
          console.error("Worker initialization failed:", workerError);
          setError(`Worker initialization failed: ${workerError}`);
          setIsWorkerInitialized(false);
          setIsLoading(false);
          break;
        case 'NEW_PERMITS_VALIDATED': { // Worker returns *only* newly fetched & validated permits
          const validatedNewPermits: PermitData[] = workerPermits || [];
          console.log(`Received validation results for ${validatedNewPermits.length} new/updated permits.`);
          const currentCache = loadCache();
          let cacheUpdated = false;

          // Merge new results into the cache and the ref map, preserving cached 'isNonceUsed' status
          validatedNewPermits.forEach(validatedPermit => {
            const key = `${validatedPermit.nonce}-${validatedPermit.networkId}`;
            const existingCachedPermit = currentCache[key];

            // Determine the correct isNonceUsed status, prioritizing cache=true
            const finalIsNonceUsed = existingCachedPermit?.isNonceUsed === true || validatedPermit.isNonceUsed === true;
            if (existingCachedPermit?.isNonceUsed === true && !finalIsNonceUsed) {
                 console.warn(`Nonce used status mismatch for key ${key}! Cache: true, Worker: ${validatedPermit.isNonceUsed}. Forcing true.`);
            } else if (existingCachedPermit?.isNonceUsed === true) {
                 console.log(`Preserving isNonceUsed=true for key ${key} from cache.`);
            }

            // Construct the final merged permit object
            const mergedPermit = {
              ...existingCachedPermit, // Start with cached data (if any)
              ...validatedPermit,     // Overwrite with fresh validation results
              isNonceUsed: finalIsNonceUsed, // Apply the determined status
            };

            allPermitsRef.current.set(key, mergedPermit); // Update ref map
            currentCache[key] = mergedPermit; // Update cache object
            cacheUpdated = true;
          });

          if (cacheUpdated) {
            console.log("Attempting to save updated permit data cache...");
            saveCache(currentCache);
          }
          // Save the timestamp of this successful check cycle
          try {
            const nowISO = new Date().toISOString();
            localStorage.setItem(PERMIT_LAST_CHECK_TIMESTAMP_KEY, nowISO);
            console.log(`Saved last check timestamp (${nowISO}) to localStorage after validation.`); // Log timestamp save
          } catch (e) { console.error("Failed to save timestamp", e); }

          applyFinalFilter(allPermitsRef.current); // Re-apply filter with new validation results
          setIsLoading(false); // Validation complete, stop loading
          break;
        }
        case 'PERMITS_ERROR': // Handles errors from fetch or validate steps in worker
          console.error("Worker error processing permits:", workerError);
          setError(`Error processing permits: ${workerError}`);
          // Don't clear permits on error, keep showing cached data
          setIsLoading(false); // Stop loading on error
          break;
      }
    };

    workerRef.current.onerror = (event) => {
      console.error("Worker error:", event.message, event);
      setError(`Worker error: ${event.message}`);
      setIsLoading(false);
      setIsWorkerInitialized(false);
    };

    return () => {
      console.log("Terminating permit checker worker.");
      workerRef.current?.terminate();
      workerRef.current = null;
      setIsWorkerInitialized(false);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applyFinalFilter, loadCache, saveCache]); // fetchPermitsAndCheck removed as it's called internally now

  // Function to fetch permits (initiates the process)
  const fetchPermitsAndCheck = useCallback(() => {
    if (!workerRef.current || !isWorkerInitialized) {
       console.warn("fetchPermitsAndCheck called before worker is ready.");
       return;
    }
    if (!isConnected || !address) {
      allPermitsRef.current.clear();
      setDisplayPermits([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    // Load cached data for immediate display
    console.log("fetchPermitsAndCheck: Attempting to load cache for initial display...");
    const cachedData = loadCache();
    const initialMap = new Map<string, PermitData>();
    Object.entries(cachedData).forEach(([key, permit]) => {
        initialMap.set(key, permit);
    });
    allPermitsRef.current = initialMap;
    applyFinalFilter(allPermitsRef.current); // Show cached data immediately
    console.log(`fetchPermitsAndCheck: Displayed ${initialMap.size} permits from cache.`);

    // Get last check timestamp from localStorage
    let lastCheckTimestamp: string | null = null;
    try {
      console.log("fetchPermitsAndCheck: Attempting to read last check timestamp...");
      lastCheckTimestamp = localStorage.getItem(PERMIT_LAST_CHECK_TIMESTAMP_KEY);
      console.log(`fetchPermitsAndCheck: Read timestamp: ${lastCheckTimestamp}`);
    } catch (e) {
      console.error("Failed to read last check timestamp from localStorage", e);
    }
    console.log(`Posting FETCH_NEW_PERMITS message to worker... Last check: ${lastCheckTimestamp || 'Never'}`);

    // Ask worker to fetch only new permits since last check
    workerRef.current.postMessage({ type: 'FETCH_NEW_PERMITS', payload: { address, lastCheckTimestamp } }); // Correct message type

  }, [address, isConnected, isWorkerInitialized, loadCache, applyFinalFilter]); // Add dependencies

  // Trigger fetch on initial mount after worker is initialized
  useEffect(() => {
      if (isConnected && isWorkerInitialized) {
          // Initial fetch is now triggered from the INIT_SUCCESS handler
          // fetchPermitsAndCheck(); // Removed duplicate call
      } else if (!isConnected) { // Clear state if disconnected
          allPermitsRef.current.clear();
          setDisplayPermits([]);
          setIsLoading(false);
      }
  }, [isConnected, isWorkerInitialized]); // Removed fetchPermitsAndCheck from deps


  // Function to manually update the status cache (e.g., after a successful claim)
  const updatePermitStatusCache = useCallback((permitKey: string, statusUpdate: Partial<PermitData>) => {
      console.log(`Attempting to update cache for key: ${permitKey} with status:`, statusUpdate); // Log cache update attempt
      const currentCache = loadCache();
      const existingCachedPermit = currentCache[permitKey];
      if (existingCachedPermit) {
          // Update the specific fields in the cached permit data
          currentCache[permitKey] = { ...existingCachedPermit, ...statusUpdate };
          saveCache(currentCache); // Save updated cache

          // Update the ref map as well
          const existingPermitInRef = allPermitsRef.current.get(permitKey);
          if (existingPermitInRef) {
              allPermitsRef.current.set(permitKey, { ...existingPermitInRef, ...statusUpdate });
              applyFinalFilter(allPermitsRef.current); // Re-filter display list
          }
      } else {
          console.warn(`Attempted to update cache for non-existent key: ${permitKey}`);
      }
  }, [loadCache, saveCache, applyFinalFilter]);


  return {
    permits: displayPermits, // Expose the filtered list for display
    setPermits: setDisplayPermits, // Allow external updates (though cache update is preferred)
    isLoading,
    // Removed: initialLoadComplete,
     error,
     setError,
     fetchPermitsAndCheck, // Keep for potential manual refresh?
     isWorkerInitialized,
     updatePermitStatusCache // Expose cache update function
   };
 }
