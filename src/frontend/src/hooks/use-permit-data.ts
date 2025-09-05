import { useCallback, useEffect, useRef, useState } from "react";
import { type Address } from "viem";
import type { AllowanceAndBalance, PermitData } from "../types.ts";
import { getCowSwapQuote } from "../utils/cowswap-utils.ts";
import { WorkerRequest, WorkerResponse } from "../workers/permit-checker.worker.ts";

const PERMIT_DATA_CACHE_KEY = "permitDataCache";

// Helper function to get error message from unknown error
function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "Quote fetching failed";
}

interface LoadingState {
  isLoading: boolean;
  isQuoting: boolean;
  isWorkerInitialized: boolean;
}

// Helper function to handle successful quotes
function handleQuotesSuccess(
  mapWithQuotes: Map<string, PermitData>,
  allPermitsRef: { current: Map<string, PermitData> },
  filterPermits: (permits: Map<string, PermitData>) => void,
  setLoadingState: React.Dispatch<React.SetStateAction<LoadingState>>
): void {
  allPermitsRef.current = mapWithQuotes;
  filterPermits(allPermitsRef.current);
  setLoadingState((prev: LoadingState) => ({ ...prev, isLoading: false }));
}

// Helper function to handle quote errors
function handleQuotesError(
  error: unknown,
  setError: React.Dispatch<React.SetStateAction<string | null>>,
  setLoadingState: React.Dispatch<React.SetStateAction<LoadingState>>
): void {
  setError(`Failed to fetch swap quotes: ${getErrorMessage(error)}`);
  setLoadingState((prev: LoadingState) => ({ ...prev, isLoading: false }));
}

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

interface LoadingState {
  isLoading: boolean;
  isQuoting: boolean;
  isWorkerInitialized: boolean;
  isFundingWallet: boolean;
}

export function usePermitData({ address, isConnected, preferredRewardTokenAddress, chainId }: UsePermitDataProps) {
  const [permits, setPermits] = useState<PermitData[]>([]);
  const [balancesAndAllowances, setBalancesAndAllowances] = useState<Map<string, AllowanceAndBalance>>(new Map());
  const [loadingState, setLoadingState] = useState<LoadingState>({
    isLoading: true,
    isQuoting: false,
    isWorkerInitialized: false,
    isFundingWallet: false,
  });
  const [error, setError] = useState<string | null>(null);
  const workerRef = useRef<WorkerGlobalScope | null>(null);
  const allPermitsRef = useRef<Map<string, PermitData>>(new Map());

  const saveCache = (cache: PermitDataCache) => {
    try {
      localStorage.setItem(PERMIT_DATA_CACHE_KEY, JSON.stringify(cache));
    } catch {
      // Intentionally ignore cache errors
    }
  };

  const filterPermits = useCallback(
    (permitsMap: Map<string, PermitData>) => {
      console.log("=== FILTERING PERMITS ===");
      console.log("Input permits map size:", permitsMap.size);
      
      // Check if current wallet is a funding wallet (owns any permits)
      let isFundingAccount = false;
      if (address) {
        permitsMap.forEach((permit) => {
          if (permit.owner.toLowerCase() === address.toLowerCase()) {
            isFundingAccount = true;
          }
        });
      }
      setLoadingState((prev) => ({ ...prev, isFundingWallet: isFundingAccount }));

      // API already filters permits by ownership, so we just need basic status filtering
      const filtered: PermitData[] = [];
      let filteredOut = 0;
      
      permitsMap.forEach((permit) => {
        // Filter out only truly claimed/used permits (less aggressive filtering)
        const definitelyUsed = permit.isNonceUsed === true;
        const definitelyClaimed = permit.status === "Claimed";
        const shouldFilter = definitelyUsed || definitelyClaimed;
        
        if (!shouldFilter) {
          filtered.push(permit);
        } else {
          filteredOut++;
          console.log(`Filtered out permit: nonce=${permit.nonce}, isNonceUsed=${permit.isNonceUsed}, status=${permit.status}`);
        }
      });
      
      console.log("Filtered permits count:", filtered.length);
      console.log("Filtered out count:", filteredOut);
      console.log("Is funding wallet:", isFundingAccount);
      
      setPermits(filtered);
    },
    [address]
  );

  const fetchQuotes = useCallback(
    async (permitsMap: Map<string, PermitData>): Promise<Map<string, PermitData>> => {
      if (!preferredRewardTokenAddress || !address || !chainId) {
        permitsMap.forEach((permit) => {
          delete permit.estimatedAmountOut;
          delete permit.quoteError;
        });
        return permitsMap;
      }
      setLoadingState((prev) => ({ ...prev, isQuoting: true }));
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
            p.quoteError = getErrorMessage(e);
            updated.set(p.signature, p);
          });
        }
      }
      setLoadingState((prev) => ({ ...prev, isQuoting: false }));
      return updated;
    },
    [preferredRewardTokenAddress, address, chainId]
  );

  useEffect(() => {
    const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
    const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      console.warn("[use-permit-data] Supabase client misconfigured: missing URL or Anon Key.");
      setError("Supabase URL or Anon Key missing in frontend environment variables.");
      setLoadingState((prev) => ({ ...prev, isWorkerInitialized: false, isLoading: false }));
      return;
    }
    workerRef.current = new Worker(new URL("../workers/permit-checker.worker.ts", import.meta.url), { type: "module" }) as WorkerGlobalScope;
    const isDevelopment = Boolean(import.meta.env.DEV) || window.location.hostname.includes(".deno.dev");
    workerRef.current.postMessage({
      type: "INIT",
      payload: { supabaseUrl: SUPABASE_URL, supabaseAnonKey: SUPABASE_ANON_KEY, isDevelopment },
    });

    workerRef.current.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const data = event.data;
      switch (data.type) {
        case "INIT_SUCCESS":
          setLoadingState((prev) => ({ ...prev, isWorkerInitialized: true }));
          break;
        case "INIT_ERROR":
          setError(`Worker initialization failed: ${data.error}`);
          setLoadingState((prev) => ({ ...prev, isWorkerInitialized: false, isLoading: false }));
          break;
        case "NEW_PERMITS_VALIDATED": {
          console.log("=== FRONTEND RECEIVED NEW_PERMITS_VALIDATED ===");
          const validated: PermitData[] = data.permits || [];
          console.log("Validated permits received:", validated.length);
          console.log("Balances and allowances received:", data.balancesAndAllowances.size);
          
          if (validated.length > 0) {
            console.log("Sample permit received:", {
              nonce: validated[0].nonce,
              amount: validated[0].amount.toString(),
              status: validated[0].status,
              checkError: validated[0].checkError
            });
          }
          
          const cache: PermitDataCache = {};
          validated.forEach((permit) => {
            cache[permit.signature] = permit;
          });
          saveCache(cache);
          setBalancesAndAllowances(data.balancesAndAllowances);
          const newPermits = new Map(Object.entries(cache));
          
          console.log("Fetching quotes for permits:", newPermits.size);
          fetchQuotes(newPermits)
            .then((mapWithQuotes) => {
              console.log("Quotes fetched, filtering permits...");
              handleQuotesSuccess(mapWithQuotes, allPermitsRef, filterPermits, setLoadingState);
            })
            .catch((e) => handleQuotesError(e, setError, setLoadingState));
          break;
        }
        case "PERMITS_ERROR":
          setError(`Error processing permits: ${data.error}`);
          setLoadingState((prev) => ({ ...prev, isLoading: false }));
          break;
      }
    };
    workerRef.current.onerror = (event) => {
      console.error("[use-permit-data] Worker error:", event);
      setError(`Worker error: ${event.message}`);
      setLoadingState((prev) => ({ ...prev, isLoading: false, isWorkerInitialized: false }));
    };

    return () => {
      workerRef.current?.terminate();
      workerRef.current = null;
      setLoadingState((prev) => ({ ...prev, isWorkerInitialized: false }));
    };
  }, [fetchQuotes, filterPermits]);

  useEffect(() => {
    if (isConnected && address && loadingState.isWorkerInitialized && workerRef.current) {
      // Clear existing permits when wallet changes
      allPermitsRef.current.clear();
      setPermits([]);
      setLoadingState((prev) => ({ ...prev, isLoading: true }));
      setError(null);
      workerRef.current.postMessage({ type: "FETCH_NEW_PERMITS", payload: { address } });
    } else if (!isConnected) {
      allPermitsRef.current.clear();
      setPermits([]);
      setLoadingState((prev) => ({ ...prev, isLoading: false }));
    }
  }, [isConnected, loadingState.isWorkerInitialized, address]);

  useEffect(() => {
    if (isConnected && address && chainId && loadingState.isWorkerInitialized && !loadingState.isLoading) {
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
  }, [preferredRewardTokenAddress, isConnected, address, chainId, loadingState.isWorkerInitialized, loadingState.isLoading, fetchQuotes, filterPermits]);

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

  return {
    permits,
    setPermits,
    balancesAndAllowances,
    setBalancesAndAllowances,
    isLoading: loadingState.isLoading,
    error,
    setError,
    isWorkerInitialized: loadingState.isWorkerInitialized,
    updatePermitStatusCache,
    isQuoting: loadingState.isQuoting,
    isFundingWallet: loadingState.isFundingWallet,
  };
}
