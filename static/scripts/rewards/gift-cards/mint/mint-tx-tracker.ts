const storageKey = "incompleteMints";

export function getIncompleteMintTx(permitNonce: string): string | null {
  const incompleteClaims = localStorage.getItem(storageKey);
  return incompleteClaims ? JSON.parse(incompleteClaims)[permitNonce] : null;
}

export function storeIncompleteMintTx(permitNonce: string, txHash: string) {
  let incompleteClaims: { [key: string]: string } = { [permitNonce]: txHash };
  const oldIncompleteClaims = localStorage.getItem(storageKey);
  if (oldIncompleteClaims) {
    incompleteClaims = { ...incompleteClaims, ...JSON.parse(oldIncompleteClaims) };
  }
  localStorage.setItem(storageKey, JSON.stringify(incompleteClaims));
}

export function removeIncompleteMintTx(permitNonce: string) {
  const incompleteClaims = localStorage.getItem(storageKey);
  if (incompleteClaims) {
    const incompleteClaimsObj = JSON.parse(incompleteClaims);
    delete incompleteClaimsObj[permitNonce];
    localStorage.setItem(storageKey, JSON.stringify(incompleteClaimsObj));
  }
}
