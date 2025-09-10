import { useEffect, useRef, useState } from "react";
import { type Address } from "viem";
import type { AllowanceAndBalance, PermitData } from "../types.ts";
// DISABLED: import { getCowSwapQuote } from "../utils/cowswap-utils.ts"; // Fake implementation removed
import { WorkerRequest, WorkerResponse } from "../workers/permit-checker.worker.ts";

const PERMIT_DATA_CACHE_KEY = "permitDataCache";

interface UsePermitDataProps {
  address: Address | undefined;
  isConnected: boolean;
  preferredRewardTokenAddress: Address | null;
  chainId: number | undefined;
  fetchBeneficiaryPermits?: boolean;
  fetchOwnerPermits?: boolean;
}

type PermitDataCache = Record<string, PermitData>;

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
      localStorage.setItem(PERMIT_DATA_CACHE_KEY, JSON.stringify(cache));
    } catch {
      // Intentionally ignore cache errors
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
      // DISABLED: Fake getCowSwapQuote implementation removed - was returning 0n always
      // TODO: Implement real CowSwap integration or remove quote feature entirely
      group.forEach((p) => {
        delete p.estimatedAmountOut;
        p.quoteError = "Quote feature temporarily disabled (fake implementation removed)";
        updated.set(p.signature, p);
      });
    }
    setIsQuoting(false);
    return updated;
  };

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
