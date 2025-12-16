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
  const [invalidationError, setInvalidationError] = useState<string | null>(null);

  const nonceBitmap = (nonce: bigint): { wordPos: bigint; bitPos: bigint } => {
    const wordPos = nonce >> 8n;
    const bitPos = nonce & 0xffn;
    return { wordPos, bitPos };
  };

  const handleInvalidatePermit = useCallback(
    async (permit: PermitData): Promise<{ success: boolean; txHash: string }> => {
      const permitKey = permit.signature;

      setIsInvalidating((prev) => ({ ...prev, [permitKey]: true }));
      setInvalidationError(null);

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
        setInvalidationError(errorMessage);
        setError(`Failed to invalidate permit: ${errorMessage}`);
        setIsInvalidating((prev) => ({ ...prev, [permitKey]: false }));
        return { success: false, txHash: "" };
      }
    },
    [address, chain, walletClient, publicClient, setPermits, setError, updatePermitStatusCache]
  );

  return {
    handleInvalidatePermit,
    isInvalidating,
    invalidationError,
  };
}
