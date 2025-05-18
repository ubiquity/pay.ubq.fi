import { useState, useCallback, useEffect, useRef } from "react";
import { type Address } from "viem";
import type { PermitData } from "../types.ts";
import { getCowSwapQuote } from "../utils/cowswap-utils.ts"; // Import quote function

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
  preferredRewardTokenAddress: Address | null; // Add prop for preference
  chainId: number | undefined; // Add prop for current chain
}

export function usePermitData({ address, isConnected, preferredRewardTokenAddress, chainId }: UsePermitDataProps) {
  // Main state holding potentially filtered permits for UI display
  const [displayPermits, setDisplayPermits] = useState<PermitData[]>([]);
  // Ref to hold the *complete* map of permits from cache + new results (including quote estimates)
  const allPermitsRef = useRef<Map<string, PermitData>>(new Map());
  const [isLoading, setIsLoading] = useState(true); // Covers both permit loading and quoting
  const [isQuoting, setIsQuoting] = useState(false); // Specific state for quoting process
  // Removed unused state: const [initialLoadComplete, setInitialLoadComplete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const [isWorkerInitialized, setIsWorkerInitialized] = useState(false);

  // Function to load PermitData cache from localStorage
  const loadCache = useCallback((): PermitDataCache => {
    try {
      const cachedString = localStorage.getItem(PERMIT_DATA_CACHE_KEY);
      const cachedData = cachedString ? JSON.parse(cachedString) : {};

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
    } catch (e) {
      console.error("Failed to save permit data cache", e);
    }
  }, []);

  // Function to apply final filtering for UI display
  const applyFinalFilter = useCallback((permitsMap: Map<string, PermitData>) => {
    const filteredList: PermitData[] = [];
    permitsMap.forEach((permit) => {
      // Filter if:
      // 1. Nonce is used OR
      // 2. Nonce check specifically failed OR
      // 3. Permit is marked as Claimed
      const nonceCheckFailed = !!(permit.checkError && permit.checkError.toLowerCase().includes("nonce"));
      const shouldFilter = permit.isNonceUsed === true || nonceCheckFailed || permit.status === "Claimed";

      if (!shouldFilter) {
        filteredList.push(permit);
      }
    });

    setDisplayPermits(filteredList);
  }, []);

  // Function to fetch quotes and update permits in the map
  const fetchQuotesAndUpdatePermits = useCallback(
    async (permitsMap: Map<string, PermitData>): Promise<Map<string, PermitData>> => {
      if (!preferredRewardTokenAddress || !address || !chainId) {
        // Clear existing quote data if preference is removed or user/chain disconnected
        permitsMap.forEach((permit) => {
          delete permit.estimatedAmountOut;
          delete permit.quoteError;
        });
        return permitsMap; // No preference set or missing info, return map as is
      }

      // console.log(`Starting quote fetching for preferred token: ${preferredRewardTokenAddress}`);
      setIsQuoting(true);
      const updatedPermitsMap = new Map(permitsMap); // Create a mutable copy

      // Group permits by their original token address
      const permitsByToken = new Map<Address, PermitData[]>();
      updatedPermitsMap.forEach((permit) => {
        // Only consider claimable ERC20 permits for quoting
        if (
          permit.tokenAddress &&
          permit.type === "erc20-permit" &&
          permit.status !== "Claimed" &&
          permit.claimStatus !== "Success" &&
          permit.claimStatus !== "Pending"
        ) {
          const group = permitsByToken.get(permit.tokenAddress as Address) || [];
          group.push(permit);
          permitsByToken.set(permit.tokenAddress as Address, group);
        }
      });

      // Fetch quote for each group that needs swapping
      for (const [tokenInAddress, groupPermits] of permitsByToken.entries()) {
        // Skip if the group's token is already the preferred token
        if (tokenInAddress.toLowerCase() === preferredRewardTokenAddress.toLowerCase()) {
          // Clear any previous quote errors for this group
          groupPermits.forEach((p) => {
            delete p.estimatedAmountOut;
            delete p.quoteError;
            updatedPermitsMap.set(`${p.nonce}-${p.networkId}`, p);
          });
          continue;
        }

        // Sum total amount for the group
        let totalAmountInWei = 0n;
        groupPermits.forEach((p) => {
          if (p.amount) {
            try {
              totalAmountInWei += BigInt(p.amount);
            } catch (e) {
              console.error(`Error parsing amount for quote: ${p.amount}`, e); // Log the error object
            }
          }
        });

        if (totalAmountInWei === 0n) {
          // Clear quote fields if total amount is zero
          groupPermits.forEach((p) => {
            delete p.estimatedAmountOut;
            delete p.quoteError;
            updatedPermitsMap.set(`${p.nonce}-${p.networkId}`, p);
          });
          continue; // Skip fetching quote if nothing to swap
        }

        try {
          // console.log(`Fetching quote: ${totalAmountInWei} ${tokenInAddress} -> ${preferredRewardTokenAddress}`);
          const quoteResult = await getCowSwapQuote({
            tokenIn: tokenInAddress,
            tokenOut: preferredRewardTokenAddress,
            amountIn: totalAmountInWei,
            userAddress: address,
            chainId: chainId, // Pass chainId
          });

          // Placeholder quote returns the total output amount in the output token's smallest unit
          const groupEstimatedTotalOut_InOutputUnits = quoteResult.estimatedAmountOut;

          groupPermits.forEach((p) => {
            if (p.amount && totalAmountInWei > 0n) {
              // Ensure permit amount and group total exist and are non-zero
              try {
                const permitAmount_InInputUnits = BigInt(p.amount);

                // Calculate the permit's proportional share of the *total estimated output*
                // individual_output = (permit_input / group_total_input) * group_total_output
                // Use BigInt math throughout to maintain precision
                const individualEstimatedOut_InOutputUnits = (permitAmount_InInputUnits * groupEstimatedTotalOut_InOutputUnits) / totalAmountInWei;

                // **** Add Detailed Logging ****
                // console.log(`DEBUG Permit ${p.nonce}: Input Amount (Input Units): ${permitAmount_InInputUnits}, Group Total Input: ${totalAmountInWei}, Group Total Output (Output Units): ${groupEstimatedTotalOut_InOutputUnits}, Calculated Individual Output (Output Units): ${individualEstimatedOut_InOutputUnits}`);
                // **** End Logging ****

                // **** Add Logging Before toString() ****
                // console.log(`DEBUG Permit ${p.nonce}: Storing estimatedAmountOut = ${individualEstimatedOut_InOutputUnits} (Type: ${typeof individualEstimatedOut_InOutputUnits})`);
                // **** End Logging ****

                p.estimatedAmountOut = individualEstimatedOut_InOutputUnits.toString(); // Store individual estimate (already in output units)
                p.quoteError = null; // Clear previous errors
              } catch (calcError) {
                console.error(`Error calculating proportional estimate for permit ${p.nonce}:`, calcError);
                p.estimatedAmountOut = undefined; // Clear estimate on error
                p.quoteError = "Calculation error";
              }
            } else {
              p.estimatedAmountOut = undefined; // Clear if permit amount is missing or group total is zero
              p.quoteError = p.amount ? "Group total is zero" : "Missing amount";
            }
            updatedPermitsMap.set(`${p.nonce}-${p.networkId}`, p); // Update the map
          });
          // Correct variable name in log message
          // console.log(`Quote success for group ${tokenInAddress}: Total Est. Out ${groupEstimatedTotalOut_InOutputUnits} ${preferredRewardTokenAddress}`);
        } catch (quoteError) {
          console.error(`Quote failed for ${tokenInAddress} -> ${preferredRewardTokenAddress}:`, quoteError);
          const errorMessage = quoteError instanceof Error ? quoteError.message : "Quote fetching failed";
          // Apply error to all permits in the group
          groupPermits.forEach((p) => {
            delete p.estimatedAmountOut; // Clear previous estimate
            p.quoteError = errorMessage;
            updatedPermitsMap.set(`${p.nonce}-${p.networkId}`, p); // Update the map
          });
        }
      }

      setIsQuoting(false);
      // console.log("Quote fetching finished.");
      return updatedPermitsMap; // Return the map with updated quote info
    },
    [preferredRewardTokenAddress, address, chainId]
  );

  // Initialize worker on mount
  useEffect(() => {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      setError("Supabase URL or Anon Key missing in frontend environment variables.");
      console.error("SupABASE URL or Anon Key missing");
      setIsWorkerInitialized(false);
      setIsLoading(false);
      return;
    }

    workerRef.current = new Worker(new URL("../workers/permit-checker.worker.ts", import.meta.url), { type: "module" });
    // console.log("Permit checker worker created.");

    workerRef.current.postMessage({
      type: "INIT",
      payload: { supabaseUrl: SUPABASE_URL, supabaseAnonKey: SUPABASE_ANON_KEY },
    });

    workerRef.current.onmessage = (event: MessageEvent) => {
      // Define a type for the worker message data
      type WorkerMessageData = {
        type: "INIT_SUCCESS" | "INIT_ERROR" | "NEW_PERMITS_VALIDATED" | "PERMITS_ERROR"; // Adjusted message types
        permits?: PermitData[]; // Used for NEW_PERMITS_VALIDATED
        error?: string;
      };
      const { type, permits: workerPermits, error: workerError } = event.data as WorkerMessageData;
      // console.log("Message received from worker:", type);

      switch (type) {
        case "INIT_SUCCESS":
          // console.log("Worker initialized successfully.");
          setIsWorkerInitialized(true);
          // Trigger initial fetch now that worker is ready (fetchPermitsAndCheck handles quoting based on cache)
          fetchPermitsAndCheck();
          break;
        case "INIT_ERROR":
          console.error("Worker initialization failed:", workerError);
          setError(`Worker initialization failed: ${workerError}`);
          setIsWorkerInitialized(false);
          setIsLoading(false);
          break;
        case "NEW_PERMITS_VALIDATED": {
          // Worker returns *only* newly fetched & validated permits
          const validatedNewPermits: PermitData[] = workerPermits || [];
          // console.log(`Received validation results for ${validatedNewPermits.length} new/updated permits.`);
          const currentCache = loadCache();
          let cacheUpdated = false;

          // Merge new results into the cache and the ref map, preserving cached 'isNonceUsed' status
          validatedNewPermits.forEach((validatedPermit) => {
            const key = `${validatedPermit.nonce}-${validatedPermit.networkId}`;
            const existingCachedPermit = currentCache[key];

            // Determine the correct isNonceUsed status, prioritizing cache=true
            const finalIsNonceUsed = existingCachedPermit?.isNonceUsed === true || validatedPermit.isNonceUsed === true;
            if (existingCachedPermit?.isNonceUsed === true && !finalIsNonceUsed) {
              console.warn(`[DEBUG] Nonce used status mismatch for key ${key}! Cache: true, Worker: ${validatedPermit.isNonceUsed}. Forcing true.`);
            }

            // Construct the final merged permit object
            const mergedPermit = {
              ...existingCachedPermit, // Start with cached data (if any)
              ...validatedPermit, // Overwrite with fresh validation results
              isNonceUsed: finalIsNonceUsed, // Apply the determined status
            };

            allPermitsRef.current.set(key, mergedPermit); // Update ref map
            currentCache[key] = mergedPermit; // Update cache object
            cacheUpdated = true;
          });

          if (cacheUpdated) {
            // console.log("Attempting to save updated permit data cache...");
            saveCache(currentCache);
          }
          // Save the timestamp of this successful check cycle
          try {
            const nowISO = new Date().toISOString();
            localStorage.setItem(PERMIT_LAST_CHECK_TIMESTAMP_KEY, nowISO);
            // console.log(`Saved last check timestamp (${nowISO}) to localStorage after validation.`); // Log timestamp save
          } catch (e) {
            console.error("Failed to save timestamp", e);
          }

          // Apply filter first based on validation results
          applyFinalFilter(allPermitsRef.current);

          // Now fetch quotes based on the updated map and preference
          fetchQuotesAndUpdatePermits(allPermitsRef.current)
            .then((mapWithQuotes) => {
              allPermitsRef.current = mapWithQuotes; // Update ref with quote results
              applyFinalFilter(allPermitsRef.current); // Re-apply filter to update UI with quotes
              setIsLoading(false); // Stop loading after validation AND quoting
            })
            .catch((quoteError) => {
              console.error("Error during post-validation quote fetching:", quoteError);
              setError(`Failed to fetch swap quotes: ${quoteError instanceof Error ? quoteError.message : quoteError}`);
              setIsLoading(false); // Still stop loading even if quoting fails
            });
          break;
        }
        case "PERMITS_ERROR": // Handles errors from fetch or validate steps in worker
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
      // console.log("Terminating permit checker worker.");
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
    // console.log("fetchPermitsAndCheck: Attempting to load cache for initial display...");
    const cachedData = loadCache();
    const initialMap = new Map<string, PermitData>();
    Object.entries(cachedData).forEach(([key, permit]) => {
      initialMap.set(key, permit);
    });
    allPermitsRef.current = initialMap;
    applyFinalFilter(allPermitsRef.current); // Show cached data immediately (without quotes initially)
    // console.log(`fetchPermitsAndCheck: Displayed ${initialMap.size} permits from cache.`);

    // Fetch quotes for cached data immediately if preference is set
    if (preferredRewardTokenAddress && address && chainId) {
      // console.log("fetchPermitsAndCheck: Fetching quotes for cached data...");
      fetchQuotesAndUpdatePermits(initialMap)
        .then((mapWithQuotes) => {
          allPermitsRef.current = mapWithQuotes; // Update ref with quote results
          applyFinalFilter(allPermitsRef.current); // Re-apply filter to update UI with quotes
          // console.log("fetchPermitsAndCheck: Updated display with quotes for cached data.");
        })
        .catch((quoteError) => {
          console.error("Error fetching quotes for cached data:", quoteError);
          // Optionally set an error state here, but don't block permit validation
        });
    }

    // Get last check timestamp from localStorage
    let lastCheckTimestamp: string | null = null;
    try {
      // console.log("fetchPermitsAndCheck: Attempting to read last check timestamp...");
      lastCheckTimestamp = localStorage.getItem(PERMIT_LAST_CHECK_TIMESTAMP_KEY);
      // console.log(`fetchPermitsAndCheck: Read timestamp: ${lastCheckTimestamp}`);
    } catch (e) {
      console.error("Failed to read last check timestamp from localStorage", e);
    }
    // console.log(`Posting FETCH_NEW_PERMITS message to worker... Last check: ${lastCheckTimestamp || 'Never'}`);

    // Ask worker to fetch only new permits since last check
    workerRef.current.postMessage({ type: "FETCH_NEW_PERMITS", payload: { address, lastCheckTimestamp } }); // Correct message type
  }, [address, isConnected, isWorkerInitialized, loadCache, applyFinalFilter, preferredRewardTokenAddress, chainId, fetchQuotesAndUpdatePermits]); // Add dependencies

  // Trigger fetch on initial mount after worker is initialized
  // Also re-trigger quote fetching if the preference changes
  useEffect(() => {
    if (isConnected && isWorkerInitialized) {
      // Initial fetch is now triggered from the INIT_SUCCESS handler
      // fetchPermitsAndCheck(); // Removed duplicate call
    } else if (!isConnected) {
      // Clear state if disconnected
      allPermitsRef.current.clear();
      setDisplayPermits([]);
      setIsLoading(false);
    }
  }, [isConnected, isWorkerInitialized]); // Removed fetchPermitsAndCheck from deps

  // Effect to re-fetch quotes when preference changes
  useEffect(() => {
    if (isConnected && address && chainId && isWorkerInitialized && !isLoading) {
      // Only quote if not already loading permits
      // console.log("Preference changed, re-fetching quotes...");
      // Use the current state of permits from the ref
      fetchQuotesAndUpdatePermits(new Map(allPermitsRef.current))
        .then((mapWithQuotes) => {
          allPermitsRef.current = mapWithQuotes;
          applyFinalFilter(allPermitsRef.current); // Update display with new quotes
        })
        .catch((quoteError) => {
          console.error("Error re-fetching quotes after preference change:", quoteError);
          setError(`Failed to update swap quotes: ${quoteError instanceof Error ? quoteError.message : quoteError}`);
          // Clear quotes on error?
          allPermitsRef.current.forEach((permit) => {
            delete permit.estimatedAmountOut;
            permit.quoteError = `Failed to update quote: ${quoteError instanceof Error ? quoteError.message : quoteError}`;
          });
          applyFinalFilter(allPermitsRef.current);
        });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preferredRewardTokenAddress, isConnected, address, chainId, isWorkerInitialized, isLoading]); // Re-run when preference changes

  // Function to manually update the status cache (e.g., after a successful claim)
  const updatePermitStatusCache = useCallback(
    (permitKey: string, statusUpdate: Partial<PermitData>) => {
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
        console.warn(`[DEBUG] updatePermitStatusCache: Attempted to update cache for non-existent key: ${permitKey}`);
      }
    },
    [loadCache, saveCache, applyFinalFilter]
  );

  return {
    permits: displayPermits, // Expose the filtered list for display
    setPermits: setDisplayPermits, // Allow external updates (though cache update is preferred)
    isLoading,
    // Removed: initialLoadComplete,
    error,
    setError,
    fetchPermitsAndCheck, // Keep for potential manual refresh?
    isWorkerInitialized,
    updatePermitStatusCache, // Expose cache update function
    isQuoting, // Expose quoting status
  };
}
