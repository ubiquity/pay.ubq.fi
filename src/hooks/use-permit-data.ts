import { useCallback, useEffect, useRef, useState } from "react";
import { type Address } from "viem";
import type { AllowanceAndBalance, PermitData } from "../types.ts";
import { getCowSwapQuote } from "../utils/cowswap-utils.ts";
import { applyPermitStatusOverrides, loadPermitStatusCache, upsertPermitStatusOverride } from "../utils/permit-status-cache.ts";
import type { WorkerResponse } from "../workers/permit-checker.worker.ts";
import { getPermitCheckerWorker, type PermitCheckerWorker } from "../workers/permit-worker-client.ts";

interface UsePermitDataProps {
  address: Address | undefined;
  isConnected: boolean;
  preferredRewardTokenAddress: Address | null;
  chainId: number | undefined;
}

export function usePermitData({ address, isConnected, preferredRewardTokenAddress, chainId }: UsePermitDataProps) {
  const [permits, setPermits] = useState<PermitData[]>([]);
  const [balancesAndAllowances, setBalancesAndAllowances] = useState<Map<string, AllowanceAndBalance>>(new Map());
  const [isLoading, setIsLoading] = useState(true);
  const [isQuoting, setIsQuoting] = useState(false);
  const [isFundingWallet, setIsFundingWallet] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [worker, setWorker] = useState<PermitCheckerWorker | null>(null);
  const allPermitsRef = useRef<Map<string, PermitData>>(new Map());
  const requestIdRef = useRef(0);
  const lastAddressRef = useRef<string | null>(null);

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
          if (data.requestId !== requestIdRef.current) return;
          const validated: PermitData[] = data.permits || [];
          const normalizedAddress = address?.toLowerCase() ?? null;
          if (!normalizedAddress || data.address.toLowerCase() !== normalizedAddress) return;

          const statusOverrides = loadPermitStatusCache(normalizedAddress);
          const newPermits = new Map<string, PermitData>();
          validated.forEach((permit) => {
            newPermits.set(permit.signature, applyPermitStatusOverrides(permit, statusOverrides));
          });

          setBalancesAndAllowances(data.balancesAndAllowances);
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
        case "PERMITS_ERROR": {
          if (data.requestId !== requestIdRef.current) return;
          const normalizedAddress = address?.toLowerCase() ?? null;
          if (!normalizedAddress || data.address.toLowerCase() !== normalizedAddress) return;
          setError(`Error processing permits: ${data.error}`);
          setIsLoading(false);
          break;
        }
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
  }, [worker, address, fetchQuotes, filterPermits]);

  useEffect(() => {
    const normalizedAddress = address?.toLowerCase() ?? null;

    if (!isConnected || !address) {
      lastAddressRef.current = null;
      requestIdRef.current += 1;
      allPermitsRef.current.clear();
      setPermits([]);
      setBalancesAndAllowances(new Map());
      setIsLoading(false);
      setIsFundingWallet(false);
      return;
    }

    if (lastAddressRef.current && normalizedAddress && lastAddressRef.current !== normalizedAddress) {
      requestIdRef.current += 1;
      allPermitsRef.current.clear();
      setPermits([]);
      setBalancesAndAllowances(new Map());
      setIsFundingWallet(false);
    }
    lastAddressRef.current = normalizedAddress;

    if (!worker) return;

    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setIsLoading(true);
    setError(null);
    worker.postMessage({ type: "FETCH_NEW_PERMITS", payload: { address, requestId } });
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

  const updatePermitStatusCache = useCallback(
    (permitKey: string, statusUpdate: Partial<PermitData>) => {
      const walletAddress = address?.toLowerCase();
      if (!walletAddress) return;

      upsertPermitStatusOverride(walletAddress, permitKey, {
        status: statusUpdate.status,
        isNonceUsed: statusUpdate.isNonceUsed,
        transactionHash: statusUpdate.transactionHash,
      });

      const normalizedKey = permitKey.toLowerCase();
      let existingKey: string | undefined;

      if (allPermitsRef.current.has(permitKey)) {
        existingKey = permitKey;
      } else if (allPermitsRef.current.has(normalizedKey)) {
        existingKey = normalizedKey;
      } else {
        for (const key of allPermitsRef.current.keys()) {
          if (key.toLowerCase() === normalizedKey) {
            existingKey = key;
            break;
          }
        }
      }

      if (!existingKey) return;
      const existing = allPermitsRef.current.get(existingKey);
      if (!existing) return;

      allPermitsRef.current.set(existingKey, { ...existing, ...statusUpdate });
      filterPermits(allPermitsRef.current);
    },
    [address, filterPermits]
  );

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
