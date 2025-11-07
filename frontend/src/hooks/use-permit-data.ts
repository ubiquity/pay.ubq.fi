import { useEffect, useRef, useState } from "react";
import { type Address } from "viem";
import type { AllowanceAndBalance, PermitData } from "../types.ts";
import { getCowSwapQuote } from "../utils/cowswap-utils.ts";
import { WorkerRequest, WorkerResponse } from "../workers/permit-checker.worker.ts";

const PERMIT_DATA_CACHE_KEY = "permitDataCache";

interface UsePermitDataProps {
  address: Address | undefined;
  isConnected: boolean;
  preferredRewardTokenAddress: Address | null;
  chainId: number | undefined;
}

type PermitDataCache = Record<string, PermitData>;

interface WorkerGlobalScope extends Worker {
  onmessage: (event: MessageEvent<WorkerResponse>) => void;
  postMessage: (message: WorkerRequest) => void;
}


async function getBackendConfig() {
  try {
    const response = await fetch('/api/config');
    if (!response.ok) throw new Error('Failed to fetch config');
    return await response.json();
  } catch (error) {
    console.error('Failed to load backend config:', error);
    throw error;
  }
}

export function usePermitData({ address, isConnected, preferredRewardTokenAddress, chainId }: UsePermitDataProps) {
  const [permits, setPermits] = useState<PermitData[]>([]);
  const [balancesAndAllowances, setBalancesAndAllowances] = useState<Map<string, AllowanceAndBalance>>(new Map());
  const [isLoading, setIsLoading] = useState(true);
  const [isQuoting, setIsQuoting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const workerRef = useRef<WorkerGlobalScope | null>(null);
  const [isWorkerInitialized, setIsWorkerInitialized] = useState(false);
  const allPermitsRef = useRef<Map<string, PermitData>>(new Map());

  const saveCache = (cache: PermitDataCache) => {
    try {
      localStorage.setItem(PERMIT_DATA_CACHE_KEY, JSON.stringify(cache));
    } catch {
      // Intentionally ignore cache errors
    }
  };

  const filterPermits = (permitsMap: Map<string, PermitData>) => {
    const filtered: PermitData[] = [];
    permitsMap.forEach((permit) => {
      const nonceCheckFailed = !!(permit.checkError && permit.checkError.toLowerCase().includes("nonce"));
      const shouldFilter = permit.isNonceUsed === true || nonceCheckFailed || permit.status === "Claimed";
      if (!shouldFilter) filtered.push(permit);
    });
    setPermits(filtered);
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
            console.warn("Failed to parse permit amount", { amount: p.amount, error: e });
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
    
    const initializeWorker = async () => {
      try {
        const config = await getBackendConfig();

        if (!config.supabaseUrl || !config.supabaseAnonKey) {
          console.warn("[use-permit-data] Backend config missing Supabase credentials");
          setError("Backend configuration incomplete");
          setIsWorkerInitialized(false);
          setIsLoading(false);
          return;
        }

        workerRef.current = new Worker(new URL("../workers/permit-checker.worker.ts", import.meta.url), { type: "module" }) as WorkerGlobalScope;

        workerRef.current.postMessage({
          type: "INIT",
          payload: {
            supabaseUrl: config.supabaseUrl,
            supabaseAnonKey: config.supabaseAnonKey,
            isDevelopment: import.meta.env.DEV
          },
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
          console.error("[use-permit-data] Worker error:", event);
          setError(`Worker error: ${event.message}`);
          setIsLoading(false);
          setIsWorkerInitialized(false);
        };

      } catch (error) {
        console.error("[use-permit-data] Failed to initialize:", error);
        setError(`Failed to initialize: ${error instanceof Error ? error.message : 'Unknown error'}`);
        setIsLoading(false);
        setIsWorkerInitialized(false);
      }
    };

    initializeWorker();

    return () => {
      workerRef.current?.terminate();
      workerRef.current = null;
      setIsWorkerInitialized(false);
    };
  }, []);

  useEffect(() => {
    if (isConnected && address && isWorkerInitialized && workerRef.current) {
      setIsLoading(true);
      setError(null);
      workerRef.current.postMessage({ type: "FETCH_NEW_PERMITS", payload: { address } });
    } else if (!isConnected) {
      allPermitsRef.current.clear();
      setPermits([]);
      setIsLoading(false);
    }
  }, [isConnected, isWorkerInitialized, address]);

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

  
  const recordClaim = async (signature: string, transactionHash: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const response = await fetch('/api/permits/record-claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signature, transactionHash })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to record claim');
      }

      const result = await response.json();
      return result;
    } catch (error) {
      console.error('Error recording claim:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  };

  return {
    permits,
    setPermits,
    balancesAndAllowances,
    setBalancesAndAllowances,
    isLoading,
    error,
    setError,
    isWorkerInitialized,
    updatePermitStatusCache,
    isQuoting,
    recordClaim, 
  };
}