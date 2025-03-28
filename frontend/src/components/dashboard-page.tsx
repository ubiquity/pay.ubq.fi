import React, { useEffect, useState } from "react";
import { useAccount, useConnect, useDisconnect, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { multicall } from '@wagmi/core'; // Import multicall
import { config } from '../main'; // Import config for multicall
import { injected } from "wagmi/connectors"; // Example connector
import type { PermitData } from "../../../shared/types"; // Corrected path
import permit2ABI from "../fixtures/permit2-abi"; // Adjust path
// Import type and prepare function
import { preparePermitPrerequisiteContracts, hasRequiredFields, type MulticallContract } from "../utils/permit-utils";
import { PermitsTable } from "./permits-table"; // Import the new table component
import logoSvgContent from "../assets/ubiquity-os-logo.svg?raw"; // Import SVG content as raw string
import { useAuth } from "../auth-context";
import type { MulticallReturnType } from '@wagmi/core'; // Import type for multicall results

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
  const { isLoggedIn, logout } = useAuth();
  const handleLogout = () => {
    logout();
  };

  // Fetch permits from backend API and check prerequisites using MULTICALL
  const fetchPermitsAndCheck = async () => {
    setIsLoading(true);
    setError(null);
    console.log("Fetching permits from backend API...");
    const token = localStorage.getItem("sessionToken");
    if (!token) {
      setError("Not authenticated. Please login.");
      setIsLoading(false);
      return;
    }

    let initialPermits: PermitData[] = []; // Keep track of initial permits

    try {
      // 1. Fetch initial permits
      const response = await fetch(`${BACKEND_API_URL}/api/permits`, {
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      });
      if (!response.ok) {
        let errorMsg = `Failed to fetch permits: ${response.status} ${response.statusText}`;
        try { const errorData = await response.json(); errorMsg = errorData.error || errorMsg; } catch { /* Ignore */ }
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
        const chainId = parseInt(networkIdStr, 10) as (1 | 100); // Ensure correct type
        const erc20Permits = networkPermits.filter(p => p.type === 'erc20-permit' && p.token?.address && p.amount && p.owner);

        if (erc20Permits.length === 0) {
          return { chainId, results: [], permitIndices: [] }; // Return empty arrays if no ERC20 permits
        }

        // Prepare contracts for multicall
        const contractsToCall: MulticallContract[] = []; // Use specific type
        const permitIndices: number[] = []; // Track original index for mapping results
        erc20Permits.forEach(permit => {
          const calls = preparePermitPrerequisiteContracts(permit);
          if (calls) {
            contractsToCall.push(...calls);
            const originalIndex = initialPermits.findIndex(p => p.nonce === permit.nonce && p.networkId === permit.networkId);
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
          const results = await multicall(config, {
            contracts: contractsToCall,
            chainId: chainId,
            allowFailure: true, // Allow individual calls to fail without failing the whole batch
          }) as MulticallReturnType<(typeof contractsToCall)>; // Cast result type

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

      multicallResults.forEach(settledResult => {
        if (settledResult.status === 'fulfilled') {
          // Type assertion for the value based on the expected structure
          const value = settledResult.value as { chainId: number; results?: MulticallReturnType<MulticallContract[]>; error?: unknown; permitIndices?: number[] };
          const { chainId, results, error, permitIndices } = value;


          if (error) {
            // Mark all associated permits with checkError due to multicall failure
            permitIndices?.forEach(permitIndex => {
              if (permitIndex !== -1 && permitIndex < initialPermits.length) { // Add bounds check
                const key = `${initialPermits[permitIndex].nonce}-${initialPermits[permitIndex].networkId}`;
                checkedPermitsMap.set(key, { checkError: "Multicall failed." });
              }
            });
            return; // Skip processing results for this chain
          }

          // Process successful results
          results?.forEach((result, callIndex) => { // result and callIndex now have inferred types
            const permitIndex = permitIndices ? permitIndices[callIndex] : -1;
            // Add bounds check for permitIndex
            if (permitIndex === -1 || permitIndex >= initialPermits.length) return;

            const permit = initialPermits[permitIndex];
            // Ensure permit and amount exist before proceeding
            if (!permit || permit.amount === undefined || permit.amount === null) return;

            const key = `${permit.nonce}-${permit.networkId}`;
            const requiredAmount = BigInt(permit.amount);
            const updateData = checkedPermitsMap.get(key) || {};

            if (result.status === 'success') {
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
      const finalCheckedPermits = initialPermits.map(permit => {
        const key = `${permit.nonce}-${permit.networkId}`;
        const checkData = checkedPermitsMap.get(key);
        // Log results for debugging
        if (permit.type === 'erc20-permit' && checkData) {
             console.log(`Prereq results for nonce ${permit.nonce}: Balance OK: ${checkData.ownerBalanceSufficient}, Allowance OK: ${checkData.permit2AllowanceSufficient}, Error: ${checkData.checkError}`);
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
          setPermits(initialPermits.map(p => ({ ...p, checkError: "Fetch failed before checks." })));
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Wallet Connection Logic
  const { address, isConnected, isConnecting, chain } = useAccount();
  const { connect } = useConnect();
  const { disconnect } = useDisconnect();

  const handleConnectWallet = () => {
    if (!isConnecting) {
      connect({ connector: injected() });
    }
  };

  // --- Handle Actual Claim ---
  const handleClaimPermit = async (permitToClaim: PermitData) => {
    console.log("Attempting to claim permit:", permitToClaim);
    if (!isConnected || !address || !chain || !writeContractAsync) { setError("Wallet not connected or chain/write function missing."); return; }
    if (permitToClaim.networkId !== chain.id) { setError(`Please switch wallet to the correct network (ID: ${permitToClaim.networkId})`); return; }
    if (!hasRequiredFields(permitToClaim)) { setError("Permit data is incomplete."); return; }

    // Re-check prerequisites from state
    if (permitToClaim.type === "erc20-permit") {
      const balanceErrorMsg = `Insufficient balance: Owner (${permitToClaim.owner}) does not have enough tokens.`;
      const allowanceErrorMsg = `Insufficient allowance: Owner (${permitToClaim.owner}) has not approved Permit2 enough tokens.`;
      const checkErrorMsg = `Prerequisite check failed: ${permitToClaim.checkError}`;

      // Restore setPermits logic
      if (permitToClaim.ownerBalanceSufficient === false) {
        console.error(balanceErrorMsg);
        setPermits(current => current.map(p => p.nonce === permitToClaim.nonce && p.networkId === permitToClaim.networkId ? { ...p, claimStatus: "Error", claimError: balanceErrorMsg } : p));
        return;
      }
      if (permitToClaim.permit2AllowanceSufficient === false) {
        console.error(allowanceErrorMsg);
        setPermits(current => current.map(p => p.nonce === permitToClaim.nonce && p.networkId === permitToClaim.networkId ? { ...p, claimStatus: "Error", claimError: allowanceErrorMsg } : p));
        return;
      }
      if (permitToClaim.checkError) {
        console.error(checkErrorMsg);
        setPermits(current => current.map(p => p.nonce === permitToClaim.nonce && p.networkId === permitToClaim.networkId ? { ...p, claimStatus: "Error", claimError: checkErrorMsg } : p));
        return;
      }
    }

    setPermits(currentPermits => currentPermits.map(p => p.nonce === permitToClaim.nonce && p.networkId === permitToClaim.networkId ? { ...p, claimStatus: 'Pending', claimError: undefined } : p));

    try {
      if (permitToClaim.type !== "erc20-permit" || !permitToClaim.amount || !permitToClaim.token?.address) { throw new Error("Invalid ERC20 permit data."); }
      const permitArgs = { permitted: { token: permitToClaim.token.address as `0x${string}`, amount: BigInt(permitToClaim.amount) }, nonce: BigInt(permitToClaim.nonce), deadline: BigInt(permitToClaim.deadline) };
      const transferDetailsArgs = { to: permitToClaim.beneficiary as `0x${string}`, requestedAmount: BigInt(permitToClaim.amount) };
      console.log("Calling permitTransferFrom with args:", { permit: permitArgs, transferDetails: transferDetailsArgs, owner: permitToClaim.owner, signature: permitToClaim.signature });

      const txHash = await writeContractAsync({ address: PERMIT2_ADDRESS, abi: permit2ABI, functionName: "permitTransferFrom", args: [permitArgs, transferDetailsArgs, permitToClaim.owner as `0x${string}`, permitToClaim.signature as `0x${string}`] });
      console.log("Claim transaction sent:", txHash);
      setPermits(currentPermits => currentPermits.map(p => p.nonce === permitToClaim.nonce && p.networkId === permitToClaim.networkId ? { ...p, transactionHash: txHash } : p));
    } catch (err) {
      console.error("Claiming failed:", err);
      const errorMessage = err instanceof Error ? err.message : "An unknown error occurred";
      setPermits(currentPermits => currentPermits.map(p => p.nonce === permitToClaim.nonce && p.networkId === permitToClaim.networkId ? { ...p, claimStatus: 'Error', claimError: errorMessage } : p));
    }
  };

  // Effect to handle transaction confirmation
  useEffect(() => {
    // Restore setPermits logic
    if (isConfirmed && receipt && hash) {
      console.log("Claim successful");
      setPermits(current => current.map(p => p.transactionHash === hash ? { ...p, claimStatus: "Success", status: "Claimed", claimError: undefined } : p));
    }
    if (receiptError && hash) {
      console.error("Claim tx failed");
      setPermits(current => current.map(p => p.transactionHash === hash ? { ...p, claimStatus: "Error", claimError: receiptError.message } : p));
    }
  }, [isConfirmed, receipt, receiptError, hash]);

  // Effect to handle write contract errors
  useEffect(() => {
    // Restore setPermits logic
    if (writeContractError) {
      console.error("Claim submission failed");
      // Find the permit that was pending and set its status to Error
      setPermits(current => current.map(p => p.claimStatus === "Pending" ? { ...p, claimStatus: "Error", claimError: writeContractError.message } : p));
    }
  }, [writeContractError]); // Removed permits dependency to avoid potential loops if error causes re-render

  // Fetch permits when connected
  useEffect(() => {
    if (isConnected) { fetchPermitsAndCheck(); }
  }, [isConnected]);

  const LogoSpan = () => ( <span id="header-logo-wrapper" dangerouslySetInnerHTML={{ __html: logoSvgContent }} /> );

  return (
    <>
      <section id="header"><h1><LogoSpan /><span>Ubiquity OS Rewards</span></h1></section>
      {isConnected ? (
        <section id="controls">
          <button onClick={() => disconnect()} className="button-with-icon">
          <svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="#ffffff"><path d="M431.54-140q-15.37 0-25.76-10.4-10.39-10.39-10.39-25.76v-76.92L281.08-367.39q-9.85-9.84-15.46-23.1-5.62-13.26-5.62-27.9v-169.3q0-20.64 8.89-38.71 8.88-18.06 27.19-27.52l56.23 56.23h-24.62q-3.07 0-5.38 2.69t-2.31 7.31V-414l135.38 135.38V-200h49.24v-78.62l41.23-41.23L85.54-780.16q-8.31-8.3-8.5-20.88-.19-12.58 8.5-21.27t21.07-8.69q12.39 0 21.08 8.69l693.85 693.85q8.31 8.31 8.5 20.88.19 12.58-8.5 21.27t-21.08 8.69q-12.38 0-21.07-8.69L588.61-277.08l-24 24v76.92q0 15.37-10.39 25.76-10.39 10.4-25.76 10.4h-96.92Zm242.92-248.77L640-423.23v-164.46q0-4.62-3.85-8.46-3.84-3.85-8.46-3.85H463.23l-116.3-116.3V-790q0-12.75 8.62-21.37 8.63-8.63 21.39-8.63 12.75 0 21.37 8.63 8.61 8.62 8.61 21.37v130h146.16v-130q0-12.75 8.63-21.37 8.62-8.63 21.38-8.63 12.75 0 21.37 8.63 8.61 8.62 8.61 21.37v160l-29.99-30h44.61q29.83 0 51.07 21.24Q700-617.52 700-587.69v146.54q0 13.03-4.9 24.84-4.89 11.81-13.87 20.77l-6.77 6.77ZM553-510.23Zm-120.38 77.77Z"/></svg>
            <span>Disconnect Wallet</span>
          </button>
          {isLoggedIn && (
            <button onClick={handleLogout} className="logout-button button-with-icon">
              <svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="#ffffff"><path d="M212.31-140Q182-140 161-161q-21-21-21-51.31v-535.38Q140-778 161-799q21-21 51.31-21h238.08q12.76 0 21.38 8.62 8.61 8.61 8.61 21.38t-8.61 21.38q-8.62 8.62-21.38 8.62H212.31q-4.62 0-8.46 3.85-3.85 3.84-3.85 8.46v535.38q0 4.62 3.85 8.46 3.84 3.85 8.46 3.85h238.08q12.76 0 21.38 8.62 8.61 8.61 8.61 21.38t-8.61 21.38q-8.62 8.62-21.38 8.62H212.31Zm492.38-310H393.85q-12.77 0-21.39-8.62-8.61-8.61-8.61-21.38t8.61-21.38q8.62-8.62 21.39-8.62h310.84l-76.92-76.92q-8.31-8.31-8.5-20.27-.19-11.96 8.5-21.27 8.69-9.31 21.08-9.62 12.38-.3 21.69 9l123.77 123.77q10.84 10.85 10.84 25.31 0 14.46-10.84 25.31L670.54-330.92q-8.92 8.92-21.19 8.8-12.27-.11-21.58-9.42-8.69-9.31-8.38-21.38.3-12.08 9-20.77l76.3-76.31Z"/></svg>
              <span>Logout</span>
            </button>
          )}
        </section>
      ) : (
        <button onClick={handleConnectWallet} disabled={isConnecting}>
          {isConnecting ? "Connecting..." : "Connect Wallet"}
        </button>
      )}
      {error && <section id="error-message-wrapper"><div className="error-message"><svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="#ffffff"><path d="M137.02-140q-10.17 0-18.27-4.97t-12.59-13.11q-4.68-8.08-5.15-17.5-.47-9.42 5.08-18.66l342.43-591.52q5.56-9.24 13.9-13.66 8.35-4.42 17.58-4.42 9.23 0 17.58 4.42 8.34 4.42 13.9 13.66l342.43 591.52q5.55 9.24 5.08 18.66-.47 9.42-5.15 17.5-4.49 8.14-12.59 13.11-8.1 4.97-18.27 4.97H137.02ZM178-200h604L480-720 178-200Zm302-47.69q13.73 0 23.02-9.29t9.29-23.02q0-13.73-9.29-23.02T480-312.31q-13.73 0-23.02 9.29T447.69-280q0 13.73 9.29 23.02t23.02 9.29Zm.01-104.62q12.76 0 21.37-8.62 8.62-8.63 8.62-21.38v-140q0-12.75-8.63-21.37-8.63-8.63-21.38-8.63-12.76 0-21.37 8.63-8.62 8.62-8.62 21.37v140q0 12.75 8.63 21.38 8.63 8.62 21.38 8.62ZM480-460Z"/></svg><span>{error}</span></div></section>}
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
