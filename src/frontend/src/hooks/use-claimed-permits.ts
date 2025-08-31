import { useEffect, useState } from "react";

export interface ClaimedPermit {
  nonce: string;
  network_id: number;
  owner: string;
  signature: string;
  transaction: string;
  beneficiary: string;
}

interface ClaimedPermitsState {
  permits: ClaimedPermit[];
  isLoading: boolean;
  error: string | null;
  lastFetch: number | null;
}

const CACHE_KEY = "ClaimedPermitsCache";
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

export function useClaimedPermits() {
  const [state, setState] = useState<ClaimedPermitsState>({
    permits: [],
    isLoading: false,
    error: null,
    lastFetch: null,
  });

  const loadFromCache = (): ClaimedPermitsState | null => {
    try {
      const cached = localStorage.getItem(CACHE_KEY);
      if (!cached) return null;

      const parsed = JSON.parse(cached) as ClaimedPermitsState;
      const now = Date.now();

      if (parsed.lastFetch && now - parsed.lastFetch < CACHE_DURATION) {
        return parsed;
      }

      return null;
    } catch (error) {
      console.error("Failed to load claimed permits from cache:", error);
      return null;
    }
  };

  const saveToCache = (data: ClaimedPermitsState) => {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(data));
    } catch (error) {
      console.error("Failed to save claimed permits to cache:", error);
    }
  };

  const fetchClaimedPermits = async () => {
    setState(prev => ({ ...prev, isLoading: true, error: null }));

    try {
      const response = await fetch("/api/permits/claimed");

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      const newState: ClaimedPermitsState = {
        permits: data.permits || [],
        isLoading: false,
        error: null,
        lastFetch: Date.now(),
      };

      setState(newState);
      saveToCache(newState);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Failed to fetch claimed permits";
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: errorMessage,
      }));
    }
  };

  const isPermitClaimed = (nonce: string, networkId: number, owner: string): boolean => {
    return state.permits.some(
      permit =>
        permit.nonce === nonce &&
        permit.network_id === networkId &&
        permit.owner.toLowerCase() === owner.toLowerCase()
    );
  };

  const getClaimedPermitsByOwner = (owner: string): ClaimedPermit[] => {
    return state.permits.filter(
      permit => permit.owner.toLowerCase() === owner.toLowerCase()
    );
  };

  const getClaimedPermitsByNetwork = (networkId: number): ClaimedPermit[] => {
    return state.permits.filter(permit => permit.network_id === networkId);
  };

  const refreshClaimedPermits = () => {
    localStorage.removeItem(CACHE_KEY);
    fetchClaimedPermits();
  };

  useEffect(() => {
    const cached = loadFromCache();
    if (cached) {
      setState(cached);
    } else {
      fetchClaimedPermits();
    }
  }, []);

  return {
    claimedPermits: state.permits,
    isLoading: state.isLoading,
    error: state.error,
    isPermitClaimed,
    getClaimedPermitsByOwner,
    getClaimedPermitsByNetwork,
    refreshClaimedPermits,
  };
}