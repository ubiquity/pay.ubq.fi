// viem-only implementation for permit claiming with local PermitDataFixed type to resolve Deno TS errors
import { useState, useCallback } from "react";
import { createRpcClient } from "@ubiquity-dao/permit2-rpc-client";
import permit2ABI from "../fixtures/permit2-abi.ts";
import { Hex, PublicClient, WalletClient, BaseError, ContractFunctionRevertedError, UserRejectedRequestError, Address, Chain } from "viem";
import { hasRequiredFields } from "../utils/permit-utils.ts";

// Move constant above all function bodies for Deno
const PERMIT2_ADDRESS = "0x000000000022D473030F116dDEE9F6B43aC78BA3" as Address;

// Local type to match frontend/src/types.ts PermitData
interface PermitDataFixed {
  nonce: string;
  amount?: string;
  token_id?: number | null;
  networkId: number;
  beneficiary: string;
  deadline: string;
  signature: string;
  type: "erc20-permit" | "erc721-permit";
  owner: string;
  tokenAddress?: string;
  githubCommentUrl: string;
  token?: { address: string; network: number; decimals?: number };
  partner?: { wallet?: { address: string } };
  status?: "Valid" | "Claimed" | "Expired" | "Invalid" | "Fetching" | "Testing" | "TestFailed" | "TestSuccess" | "Ready";
  testError?: string;
  claimStatus?: "Idle" | "Pending" | "Success" | "Error";
  claimError?: string;
  transactionHash?: string;
  ownerBalanceSufficient?: boolean;
  permit2AllowanceSufficient?: boolean;
  checkError?: string;
  isNonceUsed?: boolean;
  usdValue?: number;
  estimatedAmountOut?: string;
  quoteError?: string | null;
}

interface UsePermitClaimingProps {
  permits: PermitDataFixed[];
  setPermits: React.Dispatch<React.SetStateAction<PermitDataFixed[]>>;
  claimablePermits: PermitDataFixed[];
  setError: React.Dispatch<React.SetStateAction<string | null>>;
  updatePermitStatusCache: (permitKey: string, status: Partial<PermitDataFixed>) => void;
  publicClient: PublicClient | null;
  walletClient: WalletClient | null;
  address: Address | undefined;
  chain: Chain | null;
}

function isMaybeCodedError(e: unknown): e is { code?: number | string; message?: string; cause?: unknown } {
  return typeof e === "object" && e !== null;
}

function isUserRejection(error: unknown): boolean {
  if (error instanceof UserRejectedRequestError) return true;
  let cause = isMaybeCodedError(error) ? error.cause : undefined;
  while (cause) {
    if (isMaybeCodedError(cause)) {
      if (cause.code === 4001 || cause.code === "ACTION_REJECTED") return true;
      if (typeof cause.message === "string" && (cause.message.includes("User rejected") || cause.message.includes("denied transaction signature"))) return true;
      cause = cause.cause;
    } else break;
  }
  if (
    isMaybeCodedError(error) &&
    typeof error.message === "string" &&
    (error.message.includes("User rejected") || error.message.includes("denied transaction signature"))
  )
    return true;
  return false;
}

function isNonceUsedError(error: unknown): boolean {
  let currentError = error;
  let depth = 0;
  const maxDepth = 10;
  while (currentError && depth < maxDepth) {
    if (currentError instanceof ContractFunctionRevertedError) {
      const reason = currentError.reason?.toLowerCase();
      if (reason && (reason.includes("invalid nonce") || reason.includes("nonce already used"))) return true;
    }
    if (currentError instanceof BaseError) {
      const nestedRevert = currentError.walk((e) => e instanceof ContractFunctionRevertedError);
      if (nestedRevert instanceof ContractFunctionRevertedError) {
        const reason = nestedRevert.reason?.toLowerCase();
        if (reason && (reason.includes("invalid nonce") || reason.includes("nonce already used"))) return true;
      }
    }
    if (isMaybeCodedError(currentError) && typeof currentError.message === "string") {
      const message = currentError.message.toLowerCase();
      if (message.includes("invalid nonce") || message.includes("nonce already used") || message.includes("nonce too low")) return true;
    }
    if (currentError instanceof BaseError && "details" in currentError && typeof (currentError as any).details === "string") {
      const details = (currentError as any).details.toLowerCase();
      if (details.includes("vm execution error")) return true;
    }
    currentError = isMaybeCodedError(currentError) ? currentError.cause : undefined;
    depth++;
  }
  return false;
}

export function usePermitClaiming({
  permits,
  setPermits,
  claimablePermits,
  setError,
  updatePermitStatusCache,
  publicClient,
  walletClient,
  address,
  chain,
}: UsePermitClaimingProps) {
  const [sequentialClaimError, setSequentialClaimError] = useState<string | null>(null);
  const [isClaimingSequentially, setIsClaimingSequentially] = useState(false);

  // Wallet/chain connection error state
  const walletConnectionError =
    !publicClient || !walletClient || !address || !chain
      ? "Wallet not connected or chain unavailable."
      : null;

  // Additional state for consumer expectations
  const [isClaimConfirming, setIsClaimConfirming] = useState(false);
  const [claimTxHash, setClaimTxHash] = useState<`0x${string}` | undefined>(undefined);
  const [swapSubmissionStatus, setSwapSubmissionStatus] = useState<Record<string, { status: string; message: string }>>({});

  // --- Batch Claim All via Permit2 RPC Client ---
  const handleClaimAllBatchRpc = useCallback(async () => {
    setSequentialClaimError(null);
    setIsClaimingSequentially(true);

    if (!address || !chain?.id) {
      setSequentialClaimError("Wallet not connected or chain unavailable.");
      setIsClaimingSequentially(false);
      return;
    }

    const candidatePermits = claimablePermits;
    if (candidatePermits.length === 0) {
      setSequentialClaimError("No valid permits found on this network to claim.");
      setIsClaimingSequentially(false);
      return;
    }

    setPermits((current) =>
      current.map((p) =>
        candidatePermits.some((cp) => cp.nonce === p.nonce && cp.networkId === p.networkId) ? { ...p, claimStatus: "Pending", claimError: undefined } : p
      )
    );

    try {
      const client = createRpcClient({
        baseUrl: import.meta.env.VITE_RPC_OVERRIDE_URL,
      });

      const batchArray = candidatePermits.map((permit, idx) => ({
        jsonrpc: "2.0" as const,
        method: "permit2_claim",
        params: [permit],
        id: idx + 1,
      }));

      const results = await client.request(chain.id, batchArray);

      setPermits((current) =>
        current.map((p) => {
          const idx = candidatePermits.findIndex((cp) => cp.nonce === p.nonce && cp.networkId === p.networkId);
          if (idx === -1) return p;
          const res = Array.isArray(results) ? results[idx] : undefined;
          if (res && !res.error) {
            return { ...p, claimStatus: "Success", status: "Claimed", claimError: undefined };
          } else if (res && res.error) {
            return { ...p, claimStatus: "Error", claimError: res.error.message || "Batch claim error" };
          }
          return { ...p, claimStatus: "Error", claimError: "Unknown batch claim error" };
        })
      );
    } catch (err: unknown) {
      setSequentialClaimError((err as Error)?.message || "Batch claim failed");
      setPermits((current) =>
        current.map((p) =>
          candidatePermits.some((cp) => cp.nonce === p.nonce && cp.networkId === p.networkId)
            ? { ...p, claimStatus: "Error", claimError: (err as Error)?.message || "Batch claim failed" }
            : p
        )
      );
    }

    setIsClaimingSequentially(false);
  }, [address, chain, claimablePermits, setPermits]);

  // --- Handle Single Claim ---
  const handleClaimPermit = useCallback(
    async (permitToClaim: PermitDataFixed): Promise<boolean> => {
      const permitKey = `${permitToClaim.nonce}-${permitToClaim.networkId}`;

      if (!address || !chain?.id || !walletClient) {
        setError("Wallet not connected or chain/write function missing.");
        return false;
      }
      if (permitToClaim.networkId !== chain.id) {
        setError(`Please switch wallet to the correct network (ID: ${permitToClaim.networkId})`);
        return false;
      }
      if (!hasRequiredFields(permitToClaim)) {
        setError("Permit data is incomplete.");
        return false;
      }
      if (permitToClaim.type === "erc20-permit") {
        if (permitToClaim.ownerBalanceSufficient === false) {
          setError(`Insufficient balance: Owner (${permitToClaim.owner}) does not have enough tokens.`);
          return false;
        }
        if (permitToClaim.permit2AllowanceSufficient === false) {
          setError(`Insufficient allowance: Owner (${permitToClaim.owner}) has not approved Permit2 enough tokens.`);
          return false;
        }
        if (permitToClaim.checkError) {
          setError(`Prerequisite check failed: ${permitToClaim.checkError}`);
          return false;
        }
      }

      setPermits((currentPermits) =>
        currentPermits.map((p) =>
          p.nonce === permitToClaim.nonce && p.networkId === permitToClaim.networkId
            ? { ...p, claimStatus: "Pending", claimError: undefined, transactionHash: undefined }
            : p
        )
      );

      let simulationSuccessful = false;
      try {
        if (!publicClient) throw new Error("Public client not available for simulation.");
        if (permitToClaim.type !== "erc20-permit" || !permitToClaim.amount || !permitToClaim.token?.address) {
          throw new Error("Invalid ERC20 permit data for simulation.");
        }
        const permitArgs = {
          permitted: { token: permitToClaim.token.address as Address, amount: BigInt(permitToClaim.amount) },
          nonce: BigInt(permitToClaim.nonce),
          deadline: BigInt(permitToClaim.deadline),
        };
        const transferDetailsArgs = { to: permitToClaim.beneficiary as Address, requestedAmount: BigInt(permitToClaim.amount) };

        await publicClient.simulateContract({
          address: PERMIT2_ADDRESS,
          abi: permit2ABI,
          functionName: "permitTransferFrom",
          args: [permitArgs, transferDetailsArgs, permitToClaim.owner as Address, permitToClaim.signature as Hex],
          account: address,
        });
        simulationSuccessful = true;
      } catch (simError) {
        if (isNonceUsedError(simError)) {
          setError("Permit already claimed.");
          updatePermitStatusCache(permitKey, { isNonceUsed: true, checkError: undefined });
          setPermits((currentPermits) =>
            currentPermits.map((p) =>
              p.nonce === permitToClaim.nonce && p.networkId === permitToClaim.networkId
                ? { ...p, claimStatus: "Success", status: "Claimed", claimError: undefined, transactionHash: undefined }
                : p
            )
          );
        } else {
          const reason = simError instanceof BaseError ? simError.shortMessage : simError instanceof Error ? simError.message : "Unknown simulation error";
          setError(`Claim simulation failed: ${reason}`);
          setPermits((currentPermits) =>
            currentPermits.map((p) =>
              p.nonce === permitToClaim.nonce && p.networkId === permitToClaim.networkId
                ? { ...p, claimStatus: "Error", claimError: undefined, transactionHash: undefined }
                : p
            )
          );
        }
        return false;
      }

      if (!simulationSuccessful) {
        setError("Internal error during claim simulation.");
        setPermits((currentPermits) =>
          currentPermits.map((p) =>
            p.nonce === permitToClaim.nonce && p.networkId === permitToClaim.networkId
              ? { ...p, claimStatus: "Error", claimError: "Internal simulation error", transactionHash: undefined }
              : p
          )
        );
        return false;
      }

      try {
        setIsClaimConfirming(true);
        setClaimTxHash(undefined);
        if (permitToClaim.type !== "erc20-permit" || !permitToClaim.amount || !permitToClaim.token?.address) {
          throw new Error("Invalid ERC20 permit data for submission.");
        }
        const permitArgs = {
          permitted: { token: permitToClaim.token.address as Address, amount: BigInt(permitToClaim.amount) },
          nonce: BigInt(permitToClaim.nonce),
          deadline: BigInt(permitToClaim.deadline),
        };
        const transferDetailsArgs = { to: permitToClaim.beneficiary as Address, requestedAmount: BigInt(permitToClaim.amount) };

        // Add chain param as required by viem
        const txHash = await walletClient.writeContract({
          address: PERMIT2_ADDRESS,
          abi: permit2ABI,
          functionName: "permitTransferFrom",
          args: [permitArgs, transferDetailsArgs, permitToClaim.owner as Address, permitToClaim.signature as Hex],
          account: address,
          chain: chain,
        });

        setPermits((currentPermits) =>
          currentPermits.map((p) => (p.nonce === permitToClaim.nonce && p.networkId === permitToClaim.networkId ? { ...p, transactionHash: txHash } : p))
        );
        setClaimTxHash(txHash);
        setIsClaimConfirming(false);
        return true;
      } catch (err) {
        setIsClaimConfirming(false);
        setClaimTxHash(undefined);
        if (isUserRejection(err)) {
          setPermits((currentPermits) =>
            currentPermits.map((p) =>
              p.nonce === permitToClaim.nonce && p.networkId === permitToClaim.networkId
                ? { ...p, claimStatus: "Idle", claimError: undefined, transactionHash: undefined }
                : p
            )
          );
        } else if (isNonceUsedError(err)) {
          updatePermitStatusCache(permitKey, { isNonceUsed: true, checkError: undefined });
          setPermits((currentPermits) =>
            currentPermits.map((p) =>
              p.nonce === permitToClaim.nonce && p.networkId === permitToClaim.networkId
                ? { ...p, claimStatus: "Success", status: "Claimed", claimError: undefined, transactionHash: undefined }
                : p
            )
          );
        } else {
          setError("Claim failed. Please try again.");
          setPermits((currentPermits) =>
            currentPermits.map((p) =>
              p.nonce === permitToClaim.nonce && p.networkId === permitToClaim.networkId
                ? { ...p, claimStatus: "Error", claimError: undefined, transactionHash: undefined }
                : p
            )
          );
        }
        return false;
      }
    },
    [address, chain, publicClient, walletClient, setPermits, setError, updatePermitStatusCache]
  );

  return {
    handleClaimAllBatchRpc,
    handleClaimPermit,
    isClaimingSequentially,
    sequentialClaimError,
    isClaimConfirming,
    claimTxHash,
    swapSubmissionStatus,
    setSwapSubmissionStatus,
    walletConnectionError,
  };
}