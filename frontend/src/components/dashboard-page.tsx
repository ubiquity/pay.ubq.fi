import React, { useEffect, useState } from "react";
// Removed duplicate import line below
import { useAccount, useDisconnect, useWriteContract, useWaitForTransactionReceipt } from "wagmi"; // Removed useConnect
import { multicall } from "@wagmi/core"; // Import multicall
import { config } from "../main"; // Import config for multicall
// Removed injected import
import type { PermitData } from "../../../shared/types"; // Corrected path
import permit2ABI from "../fixtures/permit2-abi"; // Adjust path
// Import type and prepare function
import { preparePermitPrerequisiteContracts, hasRequiredFields, type MulticallContract } from "../utils/permit-utils";
import { PermitsTable } from "./permits-table"; // Import the new table component
import logoSvgContent from "../assets/ubiquity-os-logo.svg?raw"; // Import SVG content as raw string
// Removed useAuth import
import type { MulticallReturnType } from "@wagmi/core"; // Import type for multicall results
import { ICONS } from "./icons";

// Assuming BACKEND_API_URL and PERMIT2_ADDRESS are accessible
const BACKEND_API_URL = import.meta.env.VITE_BACKEND_API_URL || "http://localhost:8000";
const PERMIT2_ADDRESS = "0x000000000022D473030F116dDEE9F6B43aC78BA3"; // Universal Permit2 address

export function DashboardPage() {
  // State management
  const [permits, setPermits] = useState<PermitData[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null); // General dashboard error
  const { data: hash, error: writeContractError, writeContractAsync } = useWriteContract();

  // State for waiting for transaction receipt
  const { data: receipt, isLoading: isConfirming, isSuccess: isConfirmed, error: receiptError } = useWaitForTransactionReceipt({ hash });
  // Removed useAuth hook and related logout logic

  // Fetch permits from backend API and check prerequisites using MULTICALL
  // Wallet Connection Logic - Moved up for clarity
  const { address, isConnected, chain } = useAccount(); // Removed isConnecting
  // Removed useConnect hook call
  const { disconnect } = useDisconnect();

  // Fetch permits from backend API and check prerequisites using MULTICALL
  const fetchPermitsAndCheck = async () => {
    setIsLoading(true);
    setError(null);
    console.log("Fetching permits from backend API...");
    // Use connected wallet address instead of token
    if (!isConnected || !address) {
      setError("Wallet not connected.");
      setIsLoading(false);
      return;
    }

    let initialPermits: PermitData[] = []; // Keep track of initial permits

    try {
      // 1. Fetch initial permits using wallet address
      // Ensure the backend API endpoint supports fetching by wallet address
      const response = await fetch(`${BACKEND_API_URL}/api/permits?walletAddress=${address}`, {
        headers: { Accept: "application/json" }, // Removed Authorization header
      });
      if (!response.ok) {
        let errorMsg = `Failed to fetch permits for wallet ${address}: ${response.status} ${response.statusText}`;
        try {
          const errorData = await response.json();
          errorMsg = errorData.error || errorMsg;
        } catch {
          /* Ignore */
        }
        throw new Error(errorMsg);
      }
      const data = await response.json();
      if (!data || !Array.isArray(data.permits)) {
        console.error("Invalid permit data format received:", data);
        throw new Error("Received invalid data format for permits.");
      }
      initialPermits = data.permits.map((p: PermitData) => ({ ...p, claimStatus: "Idle" }));
      console.log("Fetched permits:", initialPermits.length);

      // 2. Group permits by networkId for multicall
      const permitsByNetwork: Record<number, PermitData[]> = initialPermits.reduce((acc, permit) => {
        const networkId = permit.networkId;
        if (networkId) {
          if (!acc[networkId]) acc[networkId] = [];
          acc[networkId].push(permit);
        }
        return acc;
      }, {} as Record<number, PermitData[]>);

      // 3. Prepare and execute multicalls for each network
      const multicallPromises = Object.entries(permitsByNetwork).map(async ([networkIdStr, networkPermits]) => {
        const chainId = parseInt(networkIdStr, 10) as 1 | 100; // Ensure correct type
        const erc20Permits = networkPermits.filter((p) => p.type === "erc20-permit" && p.token?.address && p.amount && p.owner);

        if (erc20Permits.length === 0) {
          return { chainId, results: [], permitIndices: [] }; // Return empty arrays if no ERC20 permits
        }

        // Prepare contracts for multicall
        const contractsToCall: MulticallContract[] = []; // Use specific type
        const permitIndices: number[] = []; // Track original index for mapping results
        erc20Permits.forEach((permit) => {
          const calls = preparePermitPrerequisiteContracts(permit);
          if (calls) {
            contractsToCall.push(...calls);
            const originalIndex = initialPermits.findIndex((p) => p.nonce === permit.nonce && p.networkId === permit.networkId);
            permitIndices.push(originalIndex); // Index for balance call
            permitIndices.push(originalIndex); // Index for allowance call
          }
        });

        if (contractsToCall.length === 0) {
          return { chainId, results: [], permitIndices: [] }; // Return empty arrays if no calls prepared
        }

        console.log(`Executing multicall for chain ${chainId} with ${contractsToCall.length} calls...`);
        try {
          // Define the expected return types for multicall based on the ABI
          const results = (await multicall(config, {
            contracts: contractsToCall,
            chainId: chainId,
            allowFailure: true, // Allow individual calls to fail without failing the whole batch
          })) as MulticallReturnType<typeof contractsToCall>; // Cast result type

          return { chainId, results, permitIndices }; // Return indices with results
        } catch (multiCallError) {
          console.error(`Multicall failed for chain ${chainId}:`, multiCallError);
          // Mark all permits for this chain as checkError
          return { chainId, error: multiCallError, permitIndices };
        }
      });

      // 4. Process multicall results
      const multicallResults = await Promise.allSettled(multicallPromises);
      const checkedPermitsMap = new Map<string, Partial<PermitData>>(); // Use map for efficient updates

      multicallResults.forEach((settledResult) => {
        if (settledResult.status === "fulfilled") {
          // Type assertion for the value based on the expected structure
          const value = settledResult.value as {
            chainId: number;
            results?: MulticallReturnType<MulticallContract[]>;
            error?: unknown;
            permitIndices?: number[];
          };
          const { chainId, results, error, permitIndices } = value;

          if (error) {
            // Mark all associated permits with checkError due to multicall failure
            permitIndices?.forEach((permitIndex) => {
              if (permitIndex !== -1 && permitIndex < initialPermits.length) {
                // Add bounds check
                const key = `${initialPermits[permitIndex].nonce}-${initialPermits[permitIndex].networkId}`;
                checkedPermitsMap.set(key, { checkError: "Multicall failed." });
              }
            });
            return; // Skip processing results for this chain
          }

          // Process successful results
          results?.forEach((result, callIndex) => {
            // result and callIndex now have inferred types
            const permitIndex = permitIndices ? permitIndices[callIndex] : -1;
            // Add bounds check for permitIndex
            if (permitIndex === -1 || permitIndex >= initialPermits.length) return;

            const permit = initialPermits[permitIndex];
            // Ensure permit and amount exist before proceeding
            if (!permit || permit.amount === undefined || permit.amount === null) return;

            const key = `${permit.nonce}-${permit.networkId}`;
            const requiredAmount = BigInt(permit.amount);
            const updateData = checkedPermitsMap.get(key) || {};

            if (result.status === "success") {
              const isBalanceCall = callIndex % 2 === 0; // Even indices are balance, odd are allowance
              if (isBalanceCall) {
                // Assuming balance result is bigint
                updateData.ownerBalanceSufficient = BigInt(result.result as bigint) >= requiredAmount;
              } else {
                // Assuming allowance result is bigint
                updateData.permit2AllowanceSufficient = BigInt(result.result as bigint) >= requiredAmount;
              }
            } else {
              // Individual call failed
              console.warn(`Prereq call failed for permit ${permit.nonce} on chain ${chainId}:`, result.error);
              updateData.checkError = "Check failed."; // Mark specific permit with error
            }
            checkedPermitsMap.set(key, updateData);
          });
        } else {
          // Promise itself rejected (should be less common with allowFailure: true)
          console.error("Multicall promise rejected:", settledResult.reason);
          // Potentially mark all permits as errored if needed, though allowFailure should prevent this.
        }
      });

      // 5. Merge results back into the initial permits array
      const finalCheckedPermits = initialPermits.map((permit) => {
        const key = `${permit.nonce}-${permit.networkId}`;
        const checkData = checkedPermitsMap.get(key);
        // Log results for debugging
        if (permit.type === "erc20-permit" && checkData) {
          console.log(
            `Prereq results for nonce ${permit.nonce}: Balance OK: ${checkData.ownerBalanceSufficient}, Allowance OK: ${checkData.permit2AllowanceSufficient}, Error: ${checkData.checkError}`
          );
        }
        return checkData ? { ...permit, ...checkData } : permit; // Merge if checks were performed
      });

      setPermits(finalCheckedPermits);
      console.log("Finished checking prerequisites using multicall, updated permits state.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "An unknown error occurred during fetch/check");
      console.error("Error in fetchPermitsAndCheck:", err);
      // If fetch failed, set initial permits as fetched but without checks
      if (initialPermits.length > 0 && permits.length === 0) {
        setPermits(initialPermits.map((p) => ({ ...p, checkError: "Fetch failed before checks." })));
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Removed handleConnectWallet as connection is handled in LoginPage

  // --- Handle Actual Claim ---
  const handleClaimPermit = async (permitToClaim: PermitData) => {
    console.log("Attempting to claim permit:", permitToClaim);
    if (!isConnected || !address || !chain || !writeContractAsync) {
      setError("Wallet not connected or chain/write function missing.");
      return;
    }
    if (permitToClaim.networkId !== chain.id) {
      setError(`Please switch wallet to the correct network (ID: ${permitToClaim.networkId})`);
      return;
    }
    if (!hasRequiredFields(permitToClaim)) {
      setError("Permit data is incomplete.");
      return;
    }

    // Re-check prerequisites from state
    if (permitToClaim.type === "erc20-permit") {
      const balanceErrorMsg = `Insufficient balance: Owner (${permitToClaim.owner}) does not have enough tokens.`;
      const allowanceErrorMsg = `Insufficient allowance: Owner (${permitToClaim.owner}) has not approved Permit2 enough tokens.`;
      const checkErrorMsg = `Prerequisite check failed: ${permitToClaim.checkError}`;

      // Restore setPermits logic
      if (permitToClaim.ownerBalanceSufficient === false) {
        console.error(balanceErrorMsg);
        setPermits((current) =>
          current.map((p) =>
            p.nonce === permitToClaim.nonce && p.networkId === permitToClaim.networkId ? { ...p, claimStatus: "Error", claimError: balanceErrorMsg } : p
          )
        );
        return;
      }
      if (permitToClaim.permit2AllowanceSufficient === false) {
        console.error(allowanceErrorMsg);
        setPermits((current) =>
          current.map((p) =>
            p.nonce === permitToClaim.nonce && p.networkId === permitToClaim.networkId ? { ...p, claimStatus: "Error", claimError: allowanceErrorMsg } : p
          )
        );
        return;
      }
      if (permitToClaim.checkError) {
        console.error(checkErrorMsg);
        setPermits((current) =>
          current.map((p) =>
            p.nonce === permitToClaim.nonce && p.networkId === permitToClaim.networkId ? { ...p, claimStatus: "Error", claimError: checkErrorMsg } : p
          )
        );
        return;
      }
    }

    setPermits((currentPermits) =>
      currentPermits.map((p) =>
        p.nonce === permitToClaim.nonce && p.networkId === permitToClaim.networkId ? { ...p, claimStatus: "Pending", claimError: undefined } : p
      )
    );

    try {
      if (permitToClaim.type !== "erc20-permit" || !permitToClaim.amount || !permitToClaim.token?.address) {
        throw new Error("Invalid ERC20 permit data.");
      }
      const permitArgs = {
        permitted: { token: permitToClaim.token.address as `0x${string}`, amount: BigInt(permitToClaim.amount) },
        nonce: BigInt(permitToClaim.nonce),
        deadline: BigInt(permitToClaim.deadline),
      };
      const transferDetailsArgs = { to: permitToClaim.beneficiary as `0x${string}`, requestedAmount: BigInt(permitToClaim.amount) };
      console.log("Calling permitTransferFrom with args:", {
        permit: permitArgs,
        transferDetails: transferDetailsArgs,
        owner: permitToClaim.owner,
        signature: permitToClaim.signature,
      });

      const txHash = await writeContractAsync({
        address: PERMIT2_ADDRESS,
        abi: permit2ABI,
        functionName: "permitTransferFrom",
        args: [permitArgs, transferDetailsArgs, permitToClaim.owner as `0x${string}`, permitToClaim.signature as `0x${string}`],
      });
      console.log("Claim transaction sent:", txHash);
      setPermits((currentPermits) =>
        currentPermits.map((p) => (p.nonce === permitToClaim.nonce && p.networkId === permitToClaim.networkId ? { ...p, transactionHash: txHash } : p))
      );
    } catch (err) {
      console.error("Claiming failed:", err);
      const errorMessage = err instanceof Error ? err.message : "An unknown error occurred";
      setPermits((currentPermits) =>
        currentPermits.map((p) =>
          p.nonce === permitToClaim.nonce && p.networkId === permitToClaim.networkId ? { ...p, claimStatus: "Error", claimError: errorMessage } : p
        )
      );
    }
  };

  // Effect to handle transaction confirmation
  useEffect(() => {
    // Restore setPermits logic
    if (isConfirmed && receipt && hash) {
      console.log("Claim successful");
      setPermits((current) =>
        current.map((p) => (p.transactionHash === hash ? { ...p, claimStatus: "Success", status: "Claimed", claimError: undefined } : p))
      );
    }
    if (receiptError && hash) {
      console.error("Claim tx failed");
      setPermits((current) => current.map((p) => (p.transactionHash === hash ? { ...p, claimStatus: "Error", claimError: receiptError.message } : p)));
    }
  }, [isConfirmed, receipt, receiptError, hash]);

  // Effect to handle write contract errors
  useEffect(() => {
    // Restore setPermits logic
    if (writeContractError) {
      console.error("Claim submission failed");
      // Find the permit that was pending and set its status to Error
      setPermits((current) => current.map((p) => (p.claimStatus === "Pending" ? { ...p, claimStatus: "Error", claimError: writeContractError.message } : p)));
    }
  }, [writeContractError]); // Removed permits dependency to avoid potential loops if error causes re-render

  // Fetch permits when connected
  useEffect(() => {
    if (isConnected) {
      fetchPermitsAndCheck();
    }
  }, [isConnected]);

  const LogoSpan = () => <span id="header-logo-wrapper" dangerouslySetInnerHTML={{ __html: logoSvgContent }} />;

  return (
    <>
      <section id="header">
        <div id="logo-wrapper">
          <h1>
            <LogoSpan />
            <span>Ubiquity OS Rewards</span>
          </h1>
        </div>
        {/* Moved controls inside header */}
        {isConnected && address ? ( // Check for address as well
          <div id="controls">
            <button onClick={() => disconnect()} className="button-with-icon">
              {ICONS.DISCONNECT}
              <span>{`${address.substring(0, 6)}...${address.substring(address.length - 4)}`}</span>
            </button>
            {/* Removed Logout button */}
          </div>
        ) : (
          // This part should ideally not be reached if App.tsx handles rendering LoginPage
          <div>Wallet not connected.</div>
        )}
      </section>
      {/* Controls section removed from here */}
      {error && (
        <section id="error-message-wrapper">
          <div className="error-message">
            {ICONS.WARNING}
            <span>{error}</span>
          </div>
        </section>
      )}
      <PermitsTable
        permits={permits}
        onClaimPermit={handleClaimPermit}
        isConnected={isConnected}
        chain={chain}
        isConfirming={isConfirming}
        confirmingHash={hash}
        isLoading={isLoading}
      />
    </>
  );
}
