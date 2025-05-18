import { useState, useCallback, useEffect, useRef } from "react";
import { type Address } from "viem";
import type { PermitData } from "../types.ts";
import { getCowSwapQuote } from "../utils/cowswap-utils.ts";

const PERMIT_DATA_CACHE_KEY = "permitDataCache";

interface UsePermitDataProps {
  address: Address | undefined;
  isConnected: boolean;
  preferredRewardTokenAddress: Address | null;
  chainId: number | undefined;
}

type PermitDataCache = Record<string, PermitData>;

export function usePermitData({
  address,
  isConnected,
  preferredRewardTokenAddress,
  chainId,
}: UsePermitDataProps) {
  const [permits, setPermits] = useState<PermitData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isQuoting, setIsQuoting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const [isWorkerInitialized, setIsWorkerInitialized] = useState(false);
  const allPermitsRef = useRef<Map<string, PermitData>>(new Map());

  // Save cache after fetching from Supabase
  const saveCache = useCallback((cache: PermitDataCache) => {
    try {
      localStorage.setItem(PERMIT_DATA_CACHE_KEY, JSON.stringify(cache));
    } catch (e) {
      // Ignore cache errors
    }
  }, []);

  // Filter permits for UI
  const filterPermits = useCallback((permitsMap: Map<string, PermitData>) => {
      const filtered: PermitData[] = [];
      permitsMap.forEach((permit) => {
        const nonceCheckFailed = !!(permit.checkError && permit.checkError.toLowerCase().includes("nonce"));
        const shouldFilter = permit.isNonceUsed === true || nonceCheckFailed || permit.status === "Claimed";
        let reason: string;
        if (permit.isNonceUsed === true) {
          reason = "Excluded: nonce used";
        } else if (nonceCheckFailed) {
          reason = `Excluded: nonce check error (${permit.checkError})`;
        } else if (permit.status === "Claimed") {
          reason = "Excluded: already claimed";
        } else {
          reason = "Included: claimable";
        }
        // Detailed log for each permit during filtering
        console.log("[use-permit-data] Filter check for permit", {
          key: `${permit.nonce}-${permit.networkId}`,
          status: permit.status,
          isNonceUsed: permit.isNonceUsed,
          checkError: permit.checkError,
          reason,
          permit,
        });
        if (!shouldFilter) filtered.push(permit);
      });
      // Log final filtered list
      console.log("[use-permit-data] Final filtered permits:", filtered);
      setPermits(filtered);
    }, []);

  // Fetch quotes for claimable permits
  const fetchQuotes = useCallback(
    async (permitsMap: Map<string, PermitData>): Promise<Map<string, PermitData>> => {
      if (!preferredRewardTokenAddress || !address || !chainId) {
        permitsMap.forEach((permit) => {
          delete permit.estimatedAmountOut;
          delete permit.quoteError;
        });
        return permitsMap;
      }
      setIsQuoting(true);
      const updated = new Map(permitsMap);
      const byToken = new Map<Address, PermitData[]>();
      updated.forEach((permit) => {
        if (
          permit.tokenAddress &&
          permit.type === "erc20-permit" &&
          permit.status !== "Claimed" &&
          permit.claimStatus !== "Success" &&
          permit.claimStatus !== "Pending"
        ) {
          const group = byToken.get(permit.tokenAddress as Address) || [];
          group.push(permit);
          byToken.set(permit.tokenAddress as Address, group);
        }
      });
      for (const [tokenIn, group] of byToken.entries()) {
        if (tokenIn.toLowerCase() === preferredRewardTokenAddress.toLowerCase()) {
          group.forEach((p) => {
            delete p.estimatedAmountOut;
            delete p.quoteError;
            updated.set(`${p.nonce}-${p.networkId}`, p);
          });
          continue;
        }
        let total = 0n;
        group.forEach((p) => {
          if (p.amount) {
            try {
              total += BigInt(p.amount);
            } catch {}
          }
        });
        if (total === 0n) {
          group.forEach((p) => {
            delete p.estimatedAmountOut;
            delete p.quoteError;
            updated.set(`${p.nonce}-${p.networkId}`, p);
          });
          continue;
        }
        try {
          const quote = await getCowSwapQuote({
            tokenIn,
            tokenOut: preferredRewardTokenAddress,
            amountIn: total,
            userAddress: address,
            chainId,
          });
          const groupOut = quote.estimatedAmountOut;
          group.forEach((p) => {
            if (p.amount && total > 0n) {
              try {
                const amt = BigInt(p.amount);
                p.estimatedAmountOut = ((amt * groupOut) / total).toString();
                p.quoteError = null;
              } catch {
                p.estimatedAmountOut = undefined;
                p.quoteError = "Calculation error";
              }
            } else {
              p.estimatedAmountOut = undefined;
              p.quoteError = p.amount ? "Group total is zero" : "Missing amount";
            }
            updated.set(`${p.nonce}-${p.networkId}`, p);
          });
        } catch (e: any) {
          group.forEach((p) => {
            delete p.estimatedAmountOut;
            p.quoteError = e?.message || "Quote fetching failed";
            updated.set(`${p.nonce}-${p.networkId}`, p);
          });
        }
      }
      setIsQuoting(false);
      return updated;
    },
    [preferredRewardTokenAddress, address, chainId]
  );

  // Worker setup and permit fetching
  useEffect(() => {
    const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
    const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      console.warn("[use-permit-data] Supabase client misconfigured: missing URL or Anon Key.");
      setError("Supabase URL or Anon Key missing in frontend environment variables.");
      setIsWorkerInitialized(false);
      setIsLoading(false);
      return;
    }
    console.log("[use-permit-data] Initializing permit-checker.worker.ts with Supabase config", {
      SUPABASE_URL,
      SUPABASE_ANON_KEY: SUPABASE_ANON_KEY ? "***" : undefined,
    });
    workerRef.current = new Worker(new URL("../workers/permit-checker.worker.ts", import.meta.url), { type: "module" });
    workerRef.current.postMessage({
      type: "INIT",
      payload: { supabaseUrl: SUPABASE_URL, supabaseAnonKey: SUPABASE_ANON_KEY },
    });
    workerRef.current.onmessage = (event: MessageEvent) => {
      type WorkerMessageData = {
        type: "INIT_SUCCESS" | "INIT_ERROR" | "NEW_PERMITS_VALIDATED" | "PERMITS_ERROR";
        permits?: PermitData[];
        error?: string;
      };
      // Log every worker response for debugging
      console.log("[use-permit-data] Worker message received:", event.data);
      const { type, permits: workerPermits, error: workerError } = event.data as WorkerMessageData;
      switch (type) {
        case "INIT_SUCCESS":
          setIsWorkerInitialized(true);
          fetchPermits();
          break;
        case "INIT_ERROR":
          setError(`Worker initialization failed: ${workerError}`);
          setIsWorkerInitialized(false);
          setIsLoading(false);
          break;
        case "NEW_PERMITS_VALIDATED": {
          const validated: PermitData[] = workerPermits || [];
          // Log raw permit data fetched from Supabase before any filtering
          console.log("[use-permit-data] Raw permit data fetched from Supabase:", validated);
          const cache: PermitDataCache = {};
          validated.forEach((permit) => {
            const key = `${permit.nonce}-${permit.networkId}`;
            cache[key] = permit;
          });
          saveCache(cache);
          allPermitsRef.current = new Map(Object.entries(cache));
          filterPermits(allPermitsRef.current);
          fetchQuotes(allPermitsRef.current)
            .then((mapWithQuotes) => {
              allPermitsRef.current = mapWithQuotes;
              filterPermits(allPermitsRef.current);
              setIsLoading(false);
            })
            .catch((e) => {
              setError(`Failed to fetch swap quotes: ${e instanceof Error ? e.message : e}`);
              setIsLoading(false);
            });
          break;
        }
        case "PERMITS_ERROR":
          setError(`Error processing permits: ${workerError}`);
          setIsLoading(false);
          break;
      }
    };
    workerRef.current.onerror = (event) => {
      console.error("[use-permit-data] Worker error:", event);
      setError(`Worker error: ${event.message}`);
      setIsLoading(false);
      setIsWorkerInitialized(false);
    };
    return () => {
      workerRef.current?.terminate();
      workerRef.current = null;
      setIsWorkerInitialized(false);
    };
    // eslint-disable-next-line
  }, [filterPermits, saveCache, fetchQuotes]);

  // Always fetch from Supabase on load
  const fetchPermits = useCallback(() => {
    if (!workerRef.current || !isWorkerInitialized) return;
    if (!isConnected || !address) {
      allPermitsRef.current.clear();
      setPermits([]);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setError(null);
    // Log the intended Supabase query for debugging
    console.log("[use-permit-data] Requesting permit data from Supabase via worker", {
      table: "permits",
      filters: { address },
      note: "Query will join permits -> users -> wallets tables to find permits where wallets.address matches",
      query: "First find user IDs from wallets table, then query permits where beneficiary_id is in the list of user IDs",
    });
    workerRef.current.postMessage({ type: "FETCH_NEW_PERMITS", payload: { address, lastCheckTimestamp: null } });
  }, [address, isConnected, isWorkerInitialized]);

  // Re-fetch on connection change
  useEffect(() => {
    if (isConnected && isWorkerInitialized) {
      fetchPermits();
    } else if (!isConnected) {
      allPermitsRef.current.clear();
      setPermits([]);
      setIsLoading(false);
    }
  }, [isConnected, isWorkerInitialized, fetchPermits]);

  // Re-fetch quotes when preference changes
  useEffect(() => {
    if (isConnected && address && chainId && isWorkerInitialized && !isLoading) {
      fetchQuotes(new Map(allPermitsRef.current))
        .then((mapWithQuotes) => {
          allPermitsRef.current = mapWithQuotes;
          filterPermits(allPermitsRef.current);
        })
        .catch((e) => {
          setError(`Failed to update swap quotes: ${e instanceof Error ? e.message : e}`);
          allPermitsRef.current.forEach((permit) => {
            delete permit.estimatedAmountOut;
            permit.quoteError = `Failed to update quote: ${e instanceof Error ? e.message : e}`;
          });
          filterPermits(allPermitsRef.current);
        });
    }
  }, [preferredRewardTokenAddress, isConnected, address, chainId, isWorkerInitialized, isLoading, fetchQuotes, filterPermits]);

  // Update cache after claim
  const updatePermitStatusCache = useCallback(
    (permitKey: string, statusUpdate: Partial<PermitData>) => {
      const cacheString = localStorage.getItem(PERMIT_DATA_CACHE_KEY);
      const cache: PermitDataCache = cacheString ? JSON.parse(cacheString) : {};
      if (cache[permitKey]) {
        cache[permitKey] = { ...cache[permitKey], ...statusUpdate };
        localStorage.setItem(PERMIT_DATA_CACHE_KEY, JSON.stringify(cache));
        const existing = allPermitsRef.current.get(permitKey);
        if (existing) {
          allPermitsRef.current.set(permitKey, { ...existing, ...statusUpdate });
          filterPermits(allPermitsRef.current);
        }
      }
    },
    [filterPermits]
  );

  return {
    permits,
    setPermits,
    isLoading,
    error,
    setError,
    fetchPermits,
    isWorkerInitialized,
    updatePermitStatusCache,
    isQuoting,
  };
}
