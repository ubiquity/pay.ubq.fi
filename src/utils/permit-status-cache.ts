import type { PermitData } from "../types.ts";

export type PermitStatusOverride = {
  status?: PermitData["status"];
  isNonceUsed?: boolean;
  transactionHash?: string;
  updatedAt: number;
};

type PermitStatusCache = Record<string, PermitStatusOverride>;

const STORAGE_KEY_PREFIX = "permitStatusCache:v1";

function normalizeKeyPart(value: string): string {
  return value.trim().toLowerCase();
}

function getStorageKey(walletAddress: string): string {
  return `${STORAGE_KEY_PREFIX}:${normalizeKeyPart(walletAddress)}`;
}

export function loadPermitStatusCache(walletAddress: string): PermitStatusCache {
  if (typeof localStorage === "undefined") return {};
  try {
    const raw = localStorage.getItem(getStorageKey(walletAddress));
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};

    const out: PermitStatusCache = {};
    for (const [signature, entry] of Object.entries(parsed as Record<string, unknown>)) {
      if (!signature || typeof entry !== "object" || !entry) continue;
      const record = entry as Partial<PermitStatusOverride>;
      if (typeof record.updatedAt !== "number") continue;
      out[normalizeKeyPart(signature)] = {
        status: record.status,
        isNonceUsed: record.isNonceUsed,
        transactionHash: record.transactionHash,
        updatedAt: record.updatedAt,
      };
    }
    return out;
  } catch {
    return {};
  }
}

export function savePermitStatusCache(walletAddress: string, cache: PermitStatusCache): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(getStorageKey(walletAddress), JSON.stringify(cache));
  } catch {
    // ignore cache persist errors
  }
}

export function upsertPermitStatusOverride(
  walletAddress: string,
  signature: string,
  patch: Omit<PermitStatusOverride, "updatedAt"> & { updatedAt?: number }
): PermitStatusCache {
  const cache = loadPermitStatusCache(walletAddress);
  const normalizedSignature = normalizeKeyPart(signature);

  const previous = cache[normalizedSignature];
  cache[normalizedSignature] = {
    status: patch.status ?? previous?.status,
    isNonceUsed: patch.isNonceUsed ?? previous?.isNonceUsed,
    transactionHash: patch.transactionHash ?? previous?.transactionHash,
    updatedAt: patch.updatedAt ?? Date.now(),
  };

  savePermitStatusCache(walletAddress, cache);
  return cache;
}

export function applyPermitStatusOverrides(permit: PermitData, cache: PermitStatusCache): PermitData {
  const override = cache[normalizeKeyPart(permit.signature)];
  if (!override) return permit;
  return {
    ...permit,
    ...(override.status !== undefined && { status: override.status }),
    ...(override.isNonceUsed !== undefined && { isNonceUsed: override.isNonceUsed }),
    ...(override.transactionHash !== undefined && { transactionHash: override.transactionHash }),
  };
}

