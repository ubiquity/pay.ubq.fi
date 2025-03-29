import { useState, useCallback } from "react";
import { type Address, type Abi, parseAbiItem } from "viem";
import type { PermitData } from "../../../shared/types"; // Removed unused TokenInfo
import { permit2RpcManager } from "../main";
import { readContract } from "@pavlovcik/permit2-rpc-manager";
import { preparePermitPrerequisiteContracts } from "../utils/permit-utils";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

// Get Supabase config from Vite env vars
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Define table names (matching backend)
const USERS_TABLE = "permit_app_users";
const PERMITS_TABLE = "permits";
const WALLETS_TABLE = "wallets";
const TOKENS_TABLE = "tokens";
const PARTNERS_TABLE = "partners";
const LOCATIONS_TABLE = "locations";

// ABIs needed for checks
const permit2Abi = parseAbiItem("function nonceBitmap(address owner, uint256 wordPos) view returns (uint256)");
const nftRewardAbi = parseAbiItem("function nonceRedeemed(uint256 nonce) view returns (bool)");

interface UsePermitDataProps {
  address: Address | undefined;
  isConnected: boolean;
}

// Initialize Supabase client (outside the hook to avoid re-creation on re-renders)
let supabase: SupabaseClient | null = null;
if (SUPABASE_URL && SUPABASE_ANON_KEY) {
  try {
    supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    console.log("Supabase client initialized for frontend.");
  } catch (error) {
    console.error("Error initializing Supabase client:", error);
  }
} else {
  console.error("Supabase URL or Anon Key missing in frontend environment variables.");
}

// Define a type for the permit object potentially augmented with _filterOut
type MappedPermit = PermitData & { _filterOut?: boolean };

export function usePermitData({ address, isConnected }: UsePermitDataProps) {
  const [permits, setPermits] = useState<PermitData[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [initialLoadComplete, setInitialLoadComplete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchPermitsAndCheck = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    console.log("Fetching permits directly from Supabase and checking on-chain...");

    if (!isConnected || !address) {
      setError("Wallet not connected.");
      setIsLoading(false);
      setInitialLoadComplete(true);
      setPermits([]);
      return;
    }
    if (!supabase) {
      setError("Supabase client not initialized. Check environment variables.");
      setIsLoading(false);
      setInitialLoadComplete(true);
      setPermits([]);
      return;
    }

    let initialPermits: PermitData[] = [];
    try {
      // 1. Find github_id from walletAddress
      const lowerCaseWalletAddress = address.toLowerCase();
      const { data: userData, error: userFetchError } = await supabase.from(USERS_TABLE).select("github_id").eq("wallet_address", lowerCaseWalletAddress).single();

      if (userFetchError && userFetchError.code !== 'PGRST116') { // Ignore 'PGRST116' (No rows found)
         throw new Error(`Supabase user fetch error: ${userFetchError.message}`);
      }
      if (!userData) {
         console.log(`No user found for wallet ${lowerCaseWalletAddress}`);
         setPermits([]);
         setIsLoading(false);
         setInitialLoadComplete(true);
         return;
      }
      const userGitHubId = userData.github_id;

      // 2. Find potential permits for that github_id
      const { data: potentialPermitsData, error: permitError } = await supabase.from(PERMITS_TABLE).select(`*, token: ${TOKENS_TABLE} (address, network), partner: ${PARTNERS_TABLE} (wallet: ${WALLETS_TABLE} (address)), location: ${LOCATIONS_TABLE} (node_url)`).eq("beneficiary_id", userGitHubId).is("transaction", null);

      if (permitError) {
        throw new Error(`Supabase permit fetch error: ${permitError.message}`);
      }
      if (!potentialPermitsData || potentialPermitsData.length === 0) {
        console.log(`No potential permits found for github_id ${userGitHubId}`);
        setPermits([]);
        setIsLoading(false);
        setInitialLoadComplete(true);
        return;
      }

      // 3. Map database results to PermitData structure and perform basic validation
      const mappedPermits = potentialPermitsData.map((permit: Record<string, any>): PermitData | null => { // Use Record<string, any> for db result
          const tokenData = permit.token;
          const ownerWalletData = permit.partner?.wallet;
          // Ensure nested structures exist before accessing properties
          const ownerAddressStr = ownerWalletData?.address ? String(ownerWalletData.address) : "";
          const tokenAddressStr = tokenData?.address ? String(tokenData.address) : undefined;
          const networkIdNum = Number(permit.networkId || tokenData?.network || 0);
          const githubUrlStr = permit.location?.node_url ? String(permit.location.node_url) : "";

          const permitData: PermitData = {
              nonce: String(permit.nonce),
              networkId: networkIdNum,
              beneficiary: lowerCaseWalletAddress,
              deadline: String(permit.deadline),
              signature: String(permit.signature),
              type: permit.amount && BigInt(permit.amount) > 0n ? "erc20-permit" : "erc721-permit",
              owner: ownerAddressStr,
              tokenAddress: tokenAddressStr,
              token: tokenAddressStr ? { address: tokenAddressStr, network: networkIdNum } : undefined, // Ensure token is defined only if address exists
              amount: permit.amount !== undefined && permit.amount !== null ? String(permit.amount) : undefined,
              token_id: permit.token_id !== undefined && permit.token_id !== null ? Number(permit.token_id) : undefined,
              githubCommentUrl: githubUrlStr,
              partner: ownerAddressStr ? { wallet: { address: ownerAddressStr } } : undefined, // Ensure partner is defined only if owner exists
              claimStatus: "Idle" // Initialize claim status
          };

          // Basic field validation
          if (!permitData.nonce || !permitData.deadline || !permitData.signature || !permitData.beneficiary || !permitData.owner || (!permitData.amount && !permitData.token_id) || !permitData.token?.address) {
              console.warn("Permit missing required fields:", permitData);
              return null;
          }
          // Deadline check
          const deadlineInt = parseInt(permitData.deadline, 10);
          if (isNaN(deadlineInt) || deadlineInt < Math.floor(Date.now() / 1000)) {
              console.log(`Permit ${permitData.nonce} expired.`);
              return null;
          }
          return permitData;
      }).filter((p: PermitData | null): p is PermitData => p !== null); // Corrected filter type guard

      initialPermits = mappedPermits;

      // 4. Perform frontend on-chain checks (balance, allowance, nonce)
      const checkedPermitsMap = new Map<string, Partial<PermitData & { isNonceUsed?: boolean }>>();
      const checkPromises = initialPermits.flatMap((permit) => {
          const key = `${permit.nonce}-${permit.networkId}`;
          const chainId = permit.networkId;
          const owner = permit.owner as Address; // Assume owner is valid Address after initial filter

          const promises: Promise<{key: string, type: string, result?: any, error?: Error, requiredAmount?: bigint}>[] = []; // More specific promise type

          // Nonce Check Promises
          if (permit.type === "erc20-permit") {
              const wordPos = BigInt(permit.nonce) >> 8n;
              promises.push(
                  readContract<bigint>({
                      manager: permit2RpcManager,
                      chainId: chainId,
                      address: "0x000000000022D473030F116dDEE9F6B43aC78BA3", // PERMIT2_ADDRESS
                      abi: [permit2Abi], // Use parsed ABI
                      functionName: "nonceBitmap",
                      args: [owner, wordPos],
                  }).then((bitmap) => {
                      const bit = 1n << (BigInt(permit.nonce) & 255n);
                      return { key, type: "nonce", result: Boolean(bitmap & bit) };
                  }).catch((error) => ({ key, type: "nonce", error }))
              );
          } else if (permit.type === "erc721-permit" && permit.token?.address) {
              promises.push(
                  readContract<boolean>({
                      manager: permit2RpcManager,
                      chainId: chainId,
                      address: permit.token.address as Address,
                      abi: [nftRewardAbi], // Use parsed ABI
                      functionName: "nonceRedeemed",
                      args: [BigInt(permit.nonce)],
                  }).then((isRedeemed) => ({ key, type: "nonce", result: isRedeemed }))
                    .catch((error) => ({ key, type: "nonce", error }))
              );
          }

          // Balance & Allowance Check Promises (only for ERC20)
          if (permit.type === "erc20-permit" && permit.token?.address && permit.amount && permit.owner) {
              const calls = preparePermitPrerequisiteContracts(permit);
              if (!calls) return promises;

              const requiredAmount = BigInt(permit.amount);
              const balanceCall = calls[0];
              const allowanceCall = calls[1];

              promises.push(readContract<bigint>({
                  manager: permit2RpcManager,
                  chainId: chainId,
                  address: balanceCall.address,
                  abi: balanceCall.abi as Abi,
                  functionName: balanceCall.functionName,
                  args: balanceCall.args,
              }).then((balance) => ({ key, type: "balance", result: balance, requiredAmount }))
                .catch((error) => ({ key, type: "balance", error })));

              promises.push(readContract<bigint>({
                  manager: permit2RpcManager,
                  chainId: chainId,
                  address: allowanceCall.address,
                  abi: allowanceCall.abi as Abi,
                  functionName: allowanceCall.functionName,
                  args: allowanceCall.args,
              }).then((allowance) => ({ key, type: "allowance", result: allowance, requiredAmount }))
                .catch((error) => ({ key, type: "allowance", error })));
          }

          return promises;
      });

      const settledResults = await Promise.allSettled(checkPromises);

      settledResults.forEach((settledResult) => {
          if (settledResult.status === "fulfilled") {
              const value = settledResult.value;
              // Ensure value is not null and has a key property before proceeding
              if (value && value.key) {
                  const updateData = checkedPermitsMap.get(value.key) || {};

                  if ('error' in value) {
                      console.warn(`Prereq check failed for permit ${value.key} (${value.type}):`, value.error);
                      updateData.checkError = `Check failed (${value.type}). ${value.error?.message || ''}`; // Include error message
                  } else {
                      // Add checks for requiredAmount before comparison
                      if (value.type === "balance" && value.requiredAmount !== undefined) {
                          updateData.ownerBalanceSufficient = BigInt(value.result) >= value.requiredAmount;
                      } else if (value.type === "allowance" && value.requiredAmount !== undefined) {
                          updateData.permit2AllowanceSufficient = BigInt(value.result) >= value.requiredAmount;
                      } else if (value.type === "nonce") {
                          updateData.isNonceUsed = value.result; // Store nonce status
                      }
                  }
                  checkedPermitsMap.set(value.key, updateData);
              } else {
                 console.error("Prereq check promise resolved with invalid value:", value);
              }
          } else {
              console.error("Prereq check promise rejected:", settledResult.reason);
              // Cannot reliably update map without key/type, maybe set a general error?
              // For now, just log it. Could potentially try to parse the reason if it contains the key.
          }
      });

      // Filter out permits where nonce is already used, then map the rest
      const finalCheckedPermits = initialPermits
          .map((permit) => {
              const key = `${permit.nonce}-${permit.networkId}`;
              const checkData = checkedPermitsMap.get(key);
              // If nonce check failed or nonce is used, mark for filtering
              if (checkData?.checkError?.includes("nonce") || checkData?.isNonceUsed === true) {
                  console.log(`Filtering out permit ${key} due to nonce check failure or nonce being used.`);
                  return { ...permit, ...checkData, _filterOut: true };
              }
              return checkData ? { ...permit, ...checkData } : permit;
          })
          .filter((permit: MappedPermit): permit is PermitData => !permit._filterOut); // Corrected filter type assertion


      setPermits(finalCheckedPermits);

    } catch (err) {
      setError(err instanceof Error ? err.message : "An unknown error occurred during fetch/check");
      console.error("Error in fetchPermitsAndCheck:", err);
      setPermits([]);
    } finally {
      setIsLoading(false);
      setInitialLoadComplete(true);
    }
  }, [address, isConnected]); // Dependencies for useCallback

  return {
    permits,
    setPermits, // Expose setPermits for the claiming hook to update status
    isLoading,
    initialLoadComplete,
    error,
    setError, // Export the error setter
    fetchPermitsAndCheck,
  };
}
