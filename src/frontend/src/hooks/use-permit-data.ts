import { useEffect, useRef, useState } from "react";
import { type Address } from "viem";
import type { AllowanceAndBalance, PermitData } from "../types.ts";
import { getCowSwapQuote } from "../utils/cowswap-utils.ts";
import { logger } from "../utils/logger.ts";
import { WorkerRequest, WorkerResponse } from "../workers/permit-checker.worker.ts";

const PERMIT_DATA_CACHE_KEY = "permitDataCache";
// const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes cache duration (for future use)
const QUOTE_CACHE_KEY = "quoteCache";
const QUOTE_CACHE_TTL_MS = 2 * 60 * 1000; // 2 minutes for quotes

interface UsePermitDataProps {
  address: Address | undefined;
  isConnected: boolean;
  preferredRewardTokenAddress: Address | null;
  chainId: number | undefined;
  fetchBeneficiaryPermits?: boolean;
  fetchOwnerPermits?: boolean;
}

interface CachedPermitData extends PermitData {
  cachedAt: number;
}

type PermitDataCache = Record<string, CachedPermitData>;

interface QuoteCache {
  [key: string]: {
    quote: string;
    cachedAt: number;
  };
}

interface WorkerGlobalScope extends Worker {
  onmessage: (event: MessageEvent<WorkerResponse>) => void;
  postMessage: (message: WorkerRequest) => void;
}

export function usePermitData({ address, isConnected, preferredRewardTokenAddress, chainId, fetchBeneficiaryPermits = true, fetchOwnerPermits = true }: UsePermitDataProps) {
  const [permits, setPermits] = useState<PermitData[]>([]);
  const [permitsToClaim, setPermitsToClaim] = useState<PermitData[]>([]);
  const [beneficiaryPermits, setBeneficiaryPermits] = useState<PermitData[]>([]);
  const [ownerPermits, setOwnerPermits] = useState<PermitData[]>([]);
  const [balancesAndAllowances, setBalancesAndAllowances] = useState<Map<string, AllowanceAndBalance>>(new Map());
  const [isLoading, setIsLoading] = useState(true);
  const [isQuoting, setIsQuoting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const workerRef = useRef<WorkerGlobalScope | null>(null);
  const [isWorkerInitialized, setIsWorkerInitialized] = useState(false);
  const allPermitsRef = useRef<Map<string, PermitData>>(new Map());
  const lastWalletRef = useRef<Address | undefined>(undefined);

  const saveCache = (cache: PermitDataCache) => {
    try {
      const now = Date.now();
      const cacheWithTimestamp = Object.fromEntries(
        Object.entries(cache).map(([key, permit]) => [
          key,
          { ...permit, cachedAt: now }
        ])
      );
      localStorage.setItem(PERMIT_DATA_CACHE_KEY, JSON.stringify(cacheWithTimestamp));
    } catch {
      // Intentionally ignore cache errors
    }
  };


  const getCachedQuote = (quoteKey: string): string | null => {
    try {
      const cacheString = localStorage.getItem(QUOTE_CACHE_KEY);
      if (!cacheString) return null;
      
      const cache = JSON.parse(cacheString) as QuoteCache;
      const cached = cache[quoteKey];
      
      if (cached && (Date.now() - cached.cachedAt) < QUOTE_CACHE_TTL_MS) {
        return cached.quote;
      }
      
      return null;
    } catch {
      return null;
    }
  };

  const saveQuoteToCache = (quoteKey: string, quote: string) => {
    try {
      const cacheString = localStorage.getItem(QUOTE_CACHE_KEY);
      const cache: QuoteCache = cacheString ? JSON.parse(cacheString) : {};
      
      cache[quoteKey] = {
        quote,
        cachedAt: Date.now()
      };
      
      localStorage.setItem(QUOTE_CACHE_KEY, JSON.stringify(cache));
    } catch {
      // Ignore cache errors
    }
  };

  const filterPermits = (permitsMap: Map<string, PermitData>) => {
    const allPermits: PermitData[] = [];
    const claimablePermits: PermitData[] = [];
    const beneficiaryList: PermitData[] = [];
    const ownerList: PermitData[] = [];

    permitsMap.forEach((permit) => {
      const nonceCheckFailed = !!(permit.checkError && permit.checkError.toLowerCase().includes("nonce"));
      const shouldFilter = permit.isNonceUsed === true || nonceCheckFailed || permit.status === "Claimed";
      
      if (!shouldFilter) {
        allPermits.push(permit);
        
        // Check if permit is claimable (valid and not expired)
        const isClaimable = permit.status === "Valid" && 
                           !permit.checkError && 
                           permit.claimStatus !== "Success" && 
                           permit.claimStatus !== "Pending";
        
        if (isClaimable) {
          claimablePermits.push(permit);
        }
        
        // Categorize by role
        if (address && permit.beneficiary?.toLowerCase() === address.toLowerCase()) {
          beneficiaryList.push(permit);
        }
        
        if (address && permit.owner?.toLowerCase() === address.toLowerCase()) {
          ownerList.push(permit);
        }
      }
    });
    
    setPermits(allPermits);
    setPermitsToClaim(claimablePermits);
    setBeneficiaryPermits(beneficiaryList);
    setOwnerPermits(ownerList);
  };

  const fetchQuotes = async (permitsMap: Map<string, PermitData>): Promise<Map<string, PermitData>> => {
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
          updated.set(p.signature, p);
        });
        continue;
      }
      let total = 0n;
      group.forEach((p) => {
        if (p.amount) {
          try {
            total += p.amount;
          } catch (e: unknown) {
            logger.warn("Failed to parse permit amount", { amount: p.amount, error: e });
          }
        }
      });
      if (total === 0n) {
        group.forEach((p) => {
          delete p.estimatedAmountOut;
          delete p.quoteError;
          updated.set(p.signature, p);
        });
        continue;
      }
      try {
        // Create a cache key for this quote request
        const quoteKey = `${tokenIn}-${preferredRewardTokenAddress}-${total.toString()}-${chainId}`;
        let groupOut: string | null = getCachedQuote(quoteKey);
        
        if (!groupOut) {
          // Not in cache, fetch new quote
          const quote = await getCowSwapQuote({
            tokenIn,
            tokenOut: preferredRewardTokenAddress,
            amountIn: total,
            userAddress: address,
            chainId,
          });
          groupOut = quote.estimatedAmountOut;
          
          // Save to cache
          if (groupOut) {
            saveQuoteToCache(quoteKey, groupOut);
          }
        }
        group.forEach((p) => {
          if (p.amount && total > 0n) {
            try {
              const amt = p.amount;
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
          updated.set(p.signature, p);
        });
      } catch (e: unknown) {
        group.forEach((p) => {
          delete p.estimatedAmountOut;
          p.quoteError = e instanceof Error ? e.message : typeof e === "string" ? e : "Quote fetching failed";
          updated.set(p.signature, p);
        });
      }
    }
    setIsQuoting(false);
    return updated;
  };

  useEffect(() => {
    const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
    const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      logger.warn("[use-permit-data] Supabase client misconfigured: missing URL or Anon Key.");
      setError("Supabase URL or Anon Key missing in frontend environment variables.");
      setIsWorkerInitialized(false);
      setIsLoading(false);
      return;
    }
    workerRef.current = new Worker(new URL("../workers/permit-checker.worker.ts", import.meta.url), { type: "module" }) as WorkerGlobalScope;
    workerRef.current.postMessage({
      type: "INIT",
      payload: { supabaseUrl: SUPABASE_URL, supabaseAnonKey: SUPABASE_ANON_KEY, isDevelopment: import.meta.env.DEV },
    });

    workerRef.current.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const data = event.data;
      switch (data.type) {
        case "INIT_SUCCESS":
          setIsWorkerInitialized(true);
          break;
        case "INIT_ERROR":
          setError(`Worker initialization failed: ${data.error}`);
          setIsWorkerInitialized(false);
          setIsLoading(false);
          break;
        case "NEW_PERMITS_VALIDATED": {
          const validated: PermitData[] = data.permits || [];
          const cache: PermitDataCache = {};
          validated.forEach((permit) => {
            cache[permit.signature] = permit;
          });
          saveCache(cache);
          setBalancesAndAllowances(data.balancesAndAllowances);
          const newPermits = new Map(Object.entries(cache));
          fetchQuotes(newPermits)
            .then((mapWithQuotes) => {
              allPermitsRef.current = mapWithQuotes;
              filterPermits(allPermitsRef.current);
              setIsLoading(false);
              // Clear error on successful operation
              setError(null);
            })
            .catch((e) => {
              setError(`Failed to fetch swap quotes: ${e instanceof Error ? e.message : e}`);
              setIsLoading(false);
            });
          break;
        }
        case "PERMITS_ERROR":
          setError(`Error processing permits: ${data.error}`);
          setIsLoading(false);
          break;
      }
    };
    workerRef.current.onerror = (event) => {
      logger.error("[use-permit-data] Worker error:", event);
      setError(`Worker error: ${event.message}`);
      setIsLoading(false);
      setIsWorkerInitialized(false);
    };

    return () => {
      workerRef.current?.terminate();
      workerRef.current = null;
      setIsWorkerInitialized(false);
    };
  }, []);

  // Handle wallet changes and clear permits when wallet switches
  useEffect(() => {
    if (address !== lastWalletRef.current) {
      // Wallet changed, clear previous permits and error state
      if (lastWalletRef.current !== undefined) {
        allPermitsRef.current.clear();
        setPermits([]);
        setPermitsToClaim([]);
        setBeneficiaryPermits([]);
        setOwnerPermits([]);
        setBalancesAndAllowances(new Map());
        setError(null); // Clear error on wallet switch
      }
      lastWalletRef.current = address;
    }

    if (isConnected && address && isWorkerInitialized && workerRef.current) {
      setIsLoading(true);
      setError(null);
      
      // Fetch permits based on role preferences
      let fetchMode = 'both';
      if (fetchBeneficiaryPermits && fetchOwnerPermits) {
        fetchMode = 'both';
      } else if (fetchBeneficiaryPermits) {
        fetchMode = 'beneficiary';
      } else if (fetchOwnerPermits) {
        fetchMode = 'owner';
      } else {
        fetchMode = 'none';
      }
      const fetchPayload = { address, fetchMode };
      
      workerRef.current.postMessage({ type: "FETCH_NEW_PERMITS", payload: fetchPayload });
    } else if (!isConnected) {
      allPermitsRef.current.clear();
      setPermits([]);
      setPermitsToClaim([]);
      setBeneficiaryPermits([]);
      setOwnerPermits([]);
      setBalancesAndAllowances(new Map());
      setIsLoading(false);
    }
  }, [isConnected, isWorkerInitialized, address, fetchBeneficiaryPermits, fetchOwnerPermits]);

  useEffect(() => {
    if (isConnected && address && chainId && isWorkerInitialized && !isLoading) {
      fetchQuotes(new Map(allPermitsRef.current))
        .then((mapWithQuotes: Map<string, PermitData>) => {
          allPermitsRef.current = mapWithQuotes;
          filterPermits(allPermitsRef.current);
        })
        .catch((e: unknown) => {
          setError(`Failed to update swap quotes: ${e instanceof Error ? e.message : String(e)}`);
          allPermitsRef.current.forEach((permit: PermitData) => {
            delete permit.estimatedAmountOut;
            permit.quoteError = `Failed to update quote: ${e instanceof Error ? e.message : String(e)}`;
          });
          filterPermits(allPermitsRef.current);
        });
    }
  }, [preferredRewardTokenAddress, isConnected, address, chainId, isWorkerInitialized, isLoading]);

  const updatePermitStatusCache = (permitKey: string, statusUpdate: Partial<PermitData>) => {
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
  };

  // Clear all errors
  const clearError = () => {
    setError(null);
  };

  return {
    permits,
    setPermits,
    permitsToClaim,
    beneficiaryPermits,
    ownerPermits,
    balancesAndAllowances,
    setBalancesAndAllowances,
    isLoading,
    error,
    setError,
    clearError,
    isWorkerInitialized,
    updatePermitStatusCache,
    isQuoting,
  };
}
