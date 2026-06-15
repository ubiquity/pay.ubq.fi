const STORAGE_KEY = "ubiquity-invalidated-permits";
export function useSelfInvalidation() {
  const getInvalidated = (): string[] => {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"); }
    catch { return []; }
  };
  const invalidatePermit = (nonce: number) => {
    const inv = getInvalidated();
    if (!inv.includes(nonce.toString())) {
      inv.push(nonce.toString());
      localStorage.setItem(STORAGE_KEY, JSON.stringify(inv));
    }
  };
  const isInvalidated = (nonce: number): boolean => getInvalidated().includes(nonce.toString());
  const clearAll = () => localStorage.removeItem(STORAGE_KEY);
  return { invalidatePermit, isInvalidated, clearAll };
}