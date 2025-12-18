import { useCallback, useState } from "react";
import { Address, Chain, PublicClient, WalletClient } from "viem";
import permit2Abi from "../fixtures/permit2-abi.ts";
import { PermitData } from "../types.ts";

interface UsePermitInvalidationProps {
  setPermits: React.Dispatch<React.SetStateAction<PermitData[]>>;
  setError: React.Dispatch<React.SetStateAction<string | null>>;
  updatePermitStatusCache: (permitKey: string, status: Partial<PermitData>) => void;
  publicClient: PublicClient | null;
  walletClient: WalletClient | null;
  address: Address | undefined;
  chain: Chain | null;
}

export function usePermitInvalidation({
  setPermits,
  setError,
  updatePermitStatusCache,
  publicClient,
  walletClient,
  address,
  chain,
}: UsePermitInvalidationProps) {
  const [isInvalidating, setIsInvalidating] = useState<Record<string, boolean>>({});

  const nonceBitmap = (nonce: bigint): { wordPos: bigint; bitPos: bigint } => {
    const wordPos = nonce >> 8n;
    const bitPos = nonce & 0xffn;
    return { wordPos, bitPos };
  };

  const handleInvalidatePermit = useCallback(
    async (permit: PermitData): Promise<{ success: boolean; txHash: string }> => {
      const permitKey = permit.signature;

      setIsInvalidating((prev) => ({ ...prev, [permitKey]: true }));

      if (!address || !chain || !walletClient || !publicClient) {
        setError("Wallet not connected or chain unavailable");
        setIsInvalidating((prev) => ({ ...prev, [permitKey]: false }));
        return { success: false, txHash: "" };
      }

      if (permit.owner.toLowerCase() !== address.toLowerCase()) {
        setError("You can only invalidate permits you own");
        setIsInvalidating((prev) => ({ ...prev, [permitKey]: false }));
        return { success: false, txHash: "" };
      }

      try {
        const nonceBigInt = BigInt(permit.nonce);
        const { wordPos, bitPos } = nonceBitmap(nonceBigInt);

        const { request } = await publicClient.simulateContract({
          address: permit.permit2Address,
          abi: permit2Abi,
          functionName: "invalidateUnorderedNonces",
          args: [wordPos, 1n << bitPos],
          account: address,
        });

        const txHash = await walletClient.writeContract(request);

        const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
        if (receipt.status !== "success") {
          throw new Error(`Invalidation failed with status: ${receipt.status}`);
        }

        setPermits((prev) => prev.map((p) => (p.signature === permit.signature ? { ...p, status: "Claimed", isNonceUsed: true, transactionHash: txHash } : p)));
        updatePermitStatusCache(permit.signature, { status: "Claimed", isNonceUsed: true, transactionHash: txHash });

        setIsInvalidating((prev) => ({ ...prev, [permitKey]: false }));
        return { success: true, txHash };
      } catch (error) {
        console.error("Failed to invalidate permit:", error);
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
        setError(`Failed to invalidate permit: ${errorMessage}`);
        setIsInvalidating((prev) => ({ ...prev, [permitKey]: false }));
        return { success: false, txHash: "" };
      }
    },
    [address, chain, walletClient, publicClient, setPermits, setError, updatePermitStatusCache]
  );

  const handleInvalidatePermitsBatch = useCallback(
    async (permits: PermitData[]): Promise<{ success: boolean; txHashes: string[] }> => {
      const permitKeys = Array.from(new Set(permits.map((p) => p.signature)));
      if (permitKeys.length === 0) return { success: false, txHashes: [] };

      setIsInvalidating((prev) => {
        const next = { ...prev };
        for (const key of permitKeys) next[key] = true;
        return next;
      });

      if (!address || !chain || !walletClient || !publicClient) {
        setError("Wallet not connected or chain unavailable");
        setIsInvalidating((prev) => {
          const next = { ...prev };
          for (const key of permitKeys) next[key] = false;
          return next;
        });
        return { success: false, txHashes: [] };
      }

      const normalizedAddress = address.toLowerCase();
      const notOwned = permits.filter((permit) => permit.owner.toLowerCase() !== normalizedAddress);
      if (notOwned.length > 0) {
        setError("You can only invalidate permits you own");
        setIsInvalidating((prev) => {
          const next = { ...prev };
          for (const key of permitKeys) next[key] = false;
          return next;
        });
        return { success: false, txHashes: [] };
      }

      const grouped = new Map<
        string,
        {
          permit2Address: `0x${string}`;
          wordPos: bigint;
          mask: bigint;
          signatures: string[];
        }
      >();

      for (const permit of permits) {
        const nonceBigInt = BigInt(permit.nonce);
        const { wordPos, bitPos } = nonceBitmap(nonceBigInt);
        const groupKey = `${permit.permit2Address.toLowerCase()}:${wordPos.toString()}`;
        const existing = grouped.get(groupKey) ?? { permit2Address: permit.permit2Address, wordPos, mask: 0n, signatures: [] };
        existing.mask |= 1n << bitPos;
        existing.signatures.push(permit.signature);
        grouped.set(groupKey, existing);
      }

      const txHashes: string[] = [];
      let success = true;

      for (const group of grouped.values()) {
        const groupPermitKeys = Array.from(new Set(group.signatures));
        try {
          const { request } = await publicClient.simulateContract({
            address: group.permit2Address,
            abi: permit2Abi,
            functionName: "invalidateUnorderedNonces",
            args: [group.wordPos, group.mask],
            account: address,
          });

          const txHash = await walletClient.writeContract(request);

          const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
          if (receipt.status !== "success") {
            throw new Error(`Invalidation failed with status: ${receipt.status}`);
          }

          txHashes.push(String(txHash));

          setPermits((prev) =>
            prev.map((p) => (groupPermitKeys.includes(p.signature) ? { ...p, status: "Claimed", isNonceUsed: true, transactionHash: String(txHash) } : p))
          );

          for (const key of groupPermitKeys) {
            updatePermitStatusCache(key, { status: "Claimed", isNonceUsed: true, transactionHash: String(txHash) });
          }
        } catch (error) {
          console.error("Failed to batch invalidate permits:", error);
          const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
          setError(`Failed to invalidate permits: ${errorMessage}`);
          success = false;
          break;
        } finally {
          setIsInvalidating((prev) => {
            const next = { ...prev };
            for (const key of groupPermitKeys) next[key] = false;
            return next;
          });
        }
      }

      if (!success) {
        setIsInvalidating((prev) => {
          const next = { ...prev };
          for (const key of permitKeys) next[key] = false;
          return next;
        });
      }

      return { success, txHashes };
    },
    [address, chain, walletClient, publicClient, setPermits, setError, updatePermitStatusCache]
  );

  return {
    handleInvalidatePermit,
    handleInvalidatePermitsBatch,
    isInvalidating,
  };
}
