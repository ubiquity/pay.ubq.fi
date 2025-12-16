import { useCallback, useEffect, useRef, useState } from "react";
import { type Address } from "viem";
import type { AllowanceAndBalance, PermitData } from "../types.ts";
import { getCowSwapQuote } from "../utils/cowswap-utils.ts";
import type { WorkerResponse } from "../workers/permit-checker.worker.ts";
import { getPermitCheckerWorker, type PermitCheckerWorker } from "../workers/permit-worker-client.ts";

const PERMIT_DATA_CACHE_KEY = "permitDataCache";

interface UsePermitDataProps {
  address: Address | undefined;
  isConnected: boolean;
  preferredRewardTokenAddress: Address | null;
  chainId: number | undefined;
}

type PermitDataCache = Record<string, PermitData>;

export function usePermitData({ address, isConnected, preferredRewardTokenAddress, chainId }: UsePermitDataProps) {
  const [permits, setPermits] = useState<PermitData[]>([]);
  const [balancesAndAllowances, setBalancesAndAllowances] = useState<Map<string, AllowanceAndBalance>>(new Map());
  const [isLoading, setIsLoading] = useState(true);
  const [isQuoting, setIsQuoting] = useState(false);
  const [isFundingWallet, setIsFundingWallet] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [worker, setWorker] = useState<PermitCheckerWorker | null>(null);
  const allPermitsRef = useRef<Map<string, PermitData>>(new Map());

  const saveCache = useCallback((cache: PermitDataCache) => {
    try {
      localStorage.setItem(PERMIT_DATA_CACHE_KEY, JSON.stringify(cache));
    } catch {
      // Intentionally ignore cache errors
    }
  }, []);

  const filterPermits = useCallback((permitsMap: Map<string, PermitData>) => {
    const normalizedAddress = address?.toLowerCase();
    let fundingWallet = false;
    if (normalizedAddress) {
      for (const permit of permitsMap.values()) {
        if (permit.owner.toLowerCase() === normalizedAddress) {
          fundingWallet = true;
          break;
        }
      }
    }
    setIsFundingWallet(fundingWallet);

    const filtered: PermitData[] = [];
    permitsMap.forEach((permit) => {
      const nonceCheckFailed = !!(permit.checkError && permit.checkError.toLowerCase().includes("nonce"));
      const shouldFilter = permit.isNonceUsed === true || nonceCheckFailed || permit.status === "Claimed";
      if (!shouldFilter) filtered.push(permit);
    });
    setPermits(filtered);
  }, [address]);

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
    },
    [preferredRewardTokenAddress, address, chainId]
  );

  useEffect(() => {
    let cancelled = false;

    const initWorker = async () => {
      try {
        const { worker, ready } = getPermitCheckerWorker();
        await ready;
        if (cancelled) return;
        setWorker(worker);
      } catch (e: unknown) {
        if (cancelled) return;
        const message = e instanceof Error ? e.message : String(e);
        console.warn("[use-permit-data] Worker initialization failed:", message);
        setError(message);
        setWorker(null);
        setIsLoading(false);
        setIsFundingWallet(false);
      }
    };

    void initWorker();

    return () => {
      cancelled = true;
      setWorker(null);
    };
  }, []);

  useEffect(() => {
    if (!worker) return;

    const onMessage = (event: MessageEvent<WorkerResponse>) => {
      const data = event.data;
      switch (data.type) {
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

    const onError = (event: ErrorEvent) => {
      console.error("[use-permit-data] Worker error:", event);
      setError(`Worker error: ${event.message}`);
      setIsLoading(false);
      setWorker(null);
    };

    worker.addEventListener("message", onMessage as EventListener);
    worker.addEventListener("error", onError as EventListener);

    return () => {
      worker.removeEventListener("message", onMessage as EventListener);
      worker.removeEventListener("error", onError as EventListener);
    };
  }, [worker, fetchQuotes, filterPermits, saveCache]);

  useEffect(() => {
    if (isConnected && address && worker) {
      setIsLoading(true);
      setError(null);
      worker.postMessage({ type: "FETCH_NEW_PERMITS", payload: { address } });
    } else if (!isConnected) {
      allPermitsRef.current.clear();
      setPermits([]);
      setIsLoading(false);
      setIsFundingWallet(false);
    }
  }, [isConnected, address, worker]);

  useEffect(() => {
    if (isConnected && address && chainId && worker && !isLoading) {
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
  }, [preferredRewardTokenAddress, isConnected, address, chainId, worker, isLoading, fetchQuotes, filterPermits]);

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
    isLoading,
    error,
    setError,
    isWorkerInitialized: !!worker,
    updatePermitStatusCache,
    isQuoting,
    isFundingWallet,
  };
}
