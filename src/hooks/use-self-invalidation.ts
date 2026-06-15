import { PermitData } from "../types.ts";

const STORAGE_KEY = "ubiquity-invalidated-permits";

export function useSelfInvalidation() {
  const getInvalidatedPermits = (): string[] => {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    } catch {
      return [];
    }
  };

  const invalidatePermit = (nonce: number) => {
    const invalidated = getInvalidatedPermits();
    if (!invalidated.includes(nonce.toString())) {
      invalidated.push(nonce.toString());
      localStorage.setItem(STORAGE_KEY, JSON.stringify(invalidated));
    }
  };

  const isInvalidated = (nonce: number): boolean => {
    return getInvalidatedPermits().includes(nonce.toString());
  };

  const clearAllInvalidated = () => {
    localStorage.removeItem(STORAGE_KEY);
  };

  return {
    invalidatePermit,
    isInvalidated,
    getInvalidatedPermits,
    clearAllInvalidated,
  };
}
