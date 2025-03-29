import React, { useEffect, useState } from "react"; // Removed useMemo
// Removed useWriteContracts import attempt
import { useAccount, useDisconnect, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { multicall } from "@wagmi/core";
import { config } from "../main";
import type { PermitData } from "../../../shared/types";
import permit2ABI from "../fixtures/permit2-abi";
// Import type and prepare function
import { preparePermitPrerequisiteContracts, hasRequiredFields, type MulticallContract } from "../utils/permit-utils"; // Removed formatAmount
import { PermitsTable } from "./permits-table";
import logoSvgContent from "../assets/ubiquity-os-logo.svg?raw";
import type { MulticallReturnType } from "@wagmi/core";
import { ICONS } from "./ICONS";
// Removed SendTransactionErrorType import

// Assuming BACKEND_API_URL and PERMIT2_ADDRESS are accessible
const BACKEND_API_URL = import.meta.env.VITE_BACKEND_API_URL || "http://localhost:8000";
const PERMIT2_ADDRESS = "0x000000000022D473030F116dDEE9F6B43aC78BA3"; // Universal Permit2 address

export function DashboardPage() {
  // State management
  const [permits, setPermits] = useState<PermitData[]>([]);
  const [isLoading, setIsLoading] = useState(false); // For initial data load
  const [isTableVisible, setIsTableVisible] = useState(false);
  const [initialLoadComplete, setInitialLoadComplete] = useState(false);
  const [error, setError] = useState<string | null>(null); // General dashboard error

  // Hook for single claims
  const { data: singleClaimHash, error: writeContractError, writeContractAsync } = useWriteContract();
  // Removed batch claim hooks and state

  // State for single claim confirmation
  const { data: singleClaimReceipt, isLoading: isSingleClaimConfirming, isSuccess: isSingleClaimConfirmed, error: singleClaimReceiptError } = useWaitForTransactionReceipt({ hash: singleClaimHash });
  // Removed batch claim confirmation state

  // Removed batch claim specific state

  // Wallet Connection Logic
  const { address, isConnected, chain } = useAccount();
  const { disconnect } = useDisconnect();

  // Removed Calculations for claimablePermits and totalClaimableAmount

  // --- Fetching Logic ---
  const fetchPermitsAndCheck = async () => {
    setIsLoading(true);
    setError(null);
    // Removed setClaimAllError
    console.log("Fetching permits from backend API...");
    if (!isConnected || !address) {
      setError("Wallet not connected.");
      setIsLoading(false);
      setInitialLoadComplete(true);
      return;
    }
    let initialPermits: PermitData[] = [];
    try {
      const response = await fetch(`${BACKEND_API_URL}/api/permits?walletAddress=${address}`, { headers: { Accept: "application/json" } });
      if (!response.ok) {
        let errorMsg = `Failed to fetch permits for wallet ${address}: ${response.status} ${response.statusText}`;
        try { const errorData = await response.json(); errorMsg = errorData.error || errorMsg; } catch { /* Ignore */ }
        throw new Error(errorMsg);
      }
      const data = await response.json();
      if (!data || !Array.isArray(data.permits)) { throw new Error("Received invalid data format for permits."); }
      initialPermits = data.permits.map((p: PermitData) => ({ ...p, claimStatus: "Idle" }));
      const permitsByNetwork: Record<number, PermitData[]> = initialPermits.reduce((acc, permit) => {
        const networkId = permit.networkId;
        if (networkId) { if (!acc[networkId]) acc[networkId] = []; acc[networkId].push(permit); }
        return acc;
      }, {} as Record<number, PermitData[]>);
      const multicallPromises = Object.entries(permitsByNetwork).map(async ([networkIdStr, networkPermits]) => {
        const chainId = parseInt(networkIdStr, 10) as 1 | 100;
        const erc20Permits = networkPermits.filter((p) => p.type === "erc20-permit" && p.token?.address && p.amount && p.owner);
        if (erc20Permits.length === 0) { return { chainId, results: [], permitIndices: [] }; }
        const contractsToCall: MulticallContract[] = [];
        const permitIndices: number[] = [];
        erc20Permits.forEach((permit) => {
          const calls = preparePermitPrerequisiteContracts(permit);
          if (calls) {
            contractsToCall.push(...calls);
            const originalIndex = initialPermits.findIndex((p) => p.nonce === permit.nonce && p.networkId === permit.networkId);
            permitIndices.push(originalIndex); permitIndices.push(originalIndex);
          }
        });
        if (contractsToCall.length === 0) { return { chainId, results: [], permitIndices: [] }; }
        try {
          const results = (await multicall(config, { contracts: contractsToCall, chainId: chainId, allowFailure: true })) as MulticallReturnType<typeof contractsToCall>;
          return { chainId, results, permitIndices };
        } catch (multiCallError) { console.error(`Multicall failed for chain ${chainId}:`, multiCallError); return { chainId, error: multiCallError, permitIndices }; }
      });
      const multicallResults = await Promise.allSettled(multicallPromises);
      const checkedPermitsMap = new Map<string, Partial<PermitData>>();
      multicallResults.forEach((settledResult) => {
        if (settledResult.status === "fulfilled") {
          const value = settledResult.value as { chainId: number; results?: MulticallReturnType<MulticallContract[]>; error?: unknown; permitIndices?: number[]; };
          const { chainId, results, error, permitIndices } = value;
          if (error) { permitIndices?.forEach((permitIndex) => { if (permitIndex !== -1 && permitIndex < initialPermits.length) { const key = `${initialPermits[permitIndex].nonce}-${initialPermits[permitIndex].networkId}`; checkedPermitsMap.set(key, { checkError: "Multicall failed." }); } }); return; }
          results?.forEach((result, callIndex) => {
            const permitIndex = permitIndices ? permitIndices[callIndex] : -1; if (permitIndex === -1 || permitIndex >= initialPermits.length) return;
            const permit = initialPermits[permitIndex]; if (!permit || permit.amount === undefined || permit.amount === null) return;
            const key = `${permit.nonce}-${permit.networkId}`; const requiredAmount = BigInt(permit.amount); const updateData = checkedPermitsMap.get(key) || {};
            if (result.status === "success") { const isBalanceCall = callIndex % 2 === 0; if (isBalanceCall) { updateData.ownerBalanceSufficient = BigInt(result.result as bigint) >= requiredAmount; } else { updateData.permit2AllowanceSufficient = BigInt(result.result as bigint) >= requiredAmount; } } else { console.warn(`Prereq call failed for permit ${permit.nonce} on chain ${chainId}:`, result.error); updateData.checkError = "Check failed."; }
            checkedPermitsMap.set(key, updateData);
          });
        } else { console.error("Multicall promise rejected:", settledResult.reason); }
      });
      const finalCheckedPermits = initialPermits.map((permit) => { const key = `${permit.nonce}-${permit.networkId}`; const checkData = checkedPermitsMap.get(key); return checkData ? { ...permit, ...checkData } : permit; });
      setPermits(finalCheckedPermits);
    } catch (err) { setError(err instanceof Error ? err.message : "An unknown error occurred during fetch/check"); console.error("Error in fetchPermitsAndCheck:", err); if (initialPermits.length > 0 && permits.length === 0) { setPermits(initialPermits.map((p) => ({ ...p, checkError: "Fetch failed before checks." }))); } } finally { setIsLoading(false); setInitialLoadComplete(true); }
  };

  // Function to toggle table visibility
  const toggleTableVisibility = () => {
    setIsTableVisible((prev) => !prev);
  };

  // --- Handle Single Claim ---
  const handleClaimPermit = async (permitToClaim: PermitData) => {
    console.log("Attempting to claim permit:", permitToClaim);
    if (!isConnected || !address || !chain || !writeContractAsync) { setError("Wallet not connected or chain/write function missing."); return; }
    if (permitToClaim.networkId !== chain.id) { setError(`Please switch wallet to the correct network (ID: ${permitToClaim.networkId})`); return; }
    if (!hasRequiredFields(permitToClaim)) { setError("Permit data is incomplete."); return; }
    if (permitToClaim.type === "erc20-permit") {
      const balanceErrorMsg = `Insufficient balance: Owner (${permitToClaim.owner}) does not have enough tokens.`;
      const allowanceErrorMsg = `Insufficient allowance: Owner (${permitToClaim.owner}) has not approved Permit2 enough tokens.`;
      const checkErrorMsg = `Prerequisite check failed: ${permitToClaim.checkError}`;
      if (permitToClaim.ownerBalanceSufficient === false) { console.error(balanceErrorMsg); setPermits((current) => current.map((p) => p.nonce === permitToClaim.nonce && p.networkId === permitToClaim.networkId ? { ...p, claimStatus: "Error", claimError: balanceErrorMsg } : p)); return; }
      if (permitToClaim.permit2AllowanceSufficient === false) { console.error(allowanceErrorMsg); setPermits((current) => current.map((p) => p.nonce === permitToClaim.nonce && p.networkId === permitToClaim.networkId ? { ...p, claimStatus: "Error", claimError: allowanceErrorMsg } : p)); return; }
      if (permitToClaim.checkError) { console.error(checkErrorMsg); setPermits((current) => current.map((p) => p.nonce === permitToClaim.nonce && p.networkId === permitToClaim.networkId ? { ...p, claimStatus: "Error", claimError: checkErrorMsg } : p)); return; }
    }
    setPermits((currentPermits) => currentPermits.map((p) => p.nonce === permitToClaim.nonce && p.networkId === permitToClaim.networkId ? { ...p, claimStatus: "Pending", claimError: undefined, transactionHash: undefined } : p));
    try {
      if (permitToClaim.type !== "erc20-permit" || !permitToClaim.amount || !permitToClaim.token?.address) { throw new Error("Invalid ERC20 permit data."); }
      const permitArgs = { permitted: { token: permitToClaim.token.address as `0x${string}`, amount: BigInt(permitToClaim.amount) }, nonce: BigInt(permitToClaim.nonce), deadline: BigInt(permitToClaim.deadline) };
      const transferDetailsArgs = { to: permitToClaim.beneficiary as `0x${string}`, requestedAmount: BigInt(permitToClaim.amount) };
      const txHash = await writeContractAsync({ address: PERMIT2_ADDRESS, abi: permit2ABI, functionName: "permitTransferFrom", args: [permitArgs, transferDetailsArgs, permitToClaim.owner as `0x${string}`, permitToClaim.signature as `0x${string}`] });
      console.log("Claim transaction sent:", txHash);
      setPermits((currentPermits) => currentPermits.map((p) => (p.nonce === permitToClaim.nonce && p.networkId === permitToClaim.networkId ? { ...p, transactionHash: txHash } : p)));
    } catch (err) { console.error("Claiming failed:", err); const errorMessage = err instanceof Error ? err.message : "An unknown error occurred"; setPermits((currentPermits) => currentPermits.map((p) => p.nonce === permitToClaim.nonce && p.networkId === permitToClaim.networkId ? { ...p, claimStatus: "Error", claimError: errorMessage } : p)); }
  };

  // Removed handleClaimAllClick function

  // --- Effects for Handling Transaction Results ---

  // Effect for single claim confirmation
  useEffect(() => {
    if (isSingleClaimConfirmed && singleClaimReceipt && singleClaimHash) {
      console.log("Single claim successful:", singleClaimHash);
      setPermits((current) =>
        current.map((p) => (p.transactionHash === singleClaimHash ? { ...p, claimStatus: "Success", status: "Claimed", claimError: undefined } : p))
      );
    }
    if (singleClaimReceiptError && singleClaimHash) {
      console.error("Single claim tx failed:", singleClaimReceiptError.message);
      setPermits((current) =>
        current.map((p) => (p.transactionHash === singleClaimHash ? { ...p, claimStatus: "Error", claimError: singleClaimReceiptError.message } : p))
      );
    }
  }, [isSingleClaimConfirmed, singleClaimReceipt, singleClaimReceiptError, singleClaimHash]);

  // Effect for single claim submission error
  useEffect(() => {
    if (writeContractError) {
      console.error("Single claim submission failed:", writeContractError.message);
      setPermits((current) =>
        current.map((p) =>
          p.claimStatus === "Pending" && p.transactionHash === undefined // Removed batch state checks
            ? { ...p, claimStatus: "Error", claimError: writeContractError.message }
            : p
        )
      );
    }
  }, [writeContractError]); // Removed batch state dependencies

  // Removed useEffect hooks for batch claim results

  // Fetch permits when connected
  useEffect(() => {
    if (isConnected) {
      fetchPermitsAndCheck();
    } else {
      setInitialLoadComplete(true);
      setPermits([]); // Clear permits if disconnected
    }
  }, [isConnected]);

  const LogoSpan = () => <span id="header-logo-wrapper" dangerouslySetInnerHTML={{ __html: logoSvgContent }} />;

  // Removed showClaimAll and isClaimAllDisabled calculations

  return (
    <>
      {/* Removed Claim Summary Section */}

      {/* Header Section */}
      <section id="header">
        {/* Container for spinner OR expand button (Moved to the left) */}
        <div className="spinner-or-expand-container">
          {isLoading ? ( // Show spinner only during initial load
            <div className="spinner header-spinner"></div>
          ) : (
            <button
              className="expand-button"
              disabled={!initialLoadComplete} // Only disable before initial load completes
              onClick={toggleTableVisibility}
              title={isTableVisible ? "Collapse" : "Expand"}
            >
              {isTableVisible ? ICONS.CLOSER : ICONS.OPENER}
            </button>
          )}
        </div>

        {/* Logo Wrapper (Now in the middle) */}
        <div id="logo-wrapper">
          <h1>
            <LogoSpan />
            <span>Ubiquity OS Rewards</span>
          </h1>
        </div>

        {/* Controls (Remains on the right) */}
        {isConnected && address ? ( // Check for address as well
          <div id="controls">
            <button onClick={() => disconnect()} className="button-with-icon">
              {ICONS.DISCONNECT}
              <span>{`${address.substring(0, 6)}...${address.substring(address.length - 4)}`}</span>
            </button>
          </div>
        ) : (
          // This part should ideally not be reached if App.tsx handles rendering LoginPage
          <div>Wallet not connected.</div>
        )}
      </section>

      {/* General Error Display */}
      {error && ( // Removed !claimAllError check
        <section id="error-message-wrapper">
          <div className="error-message">
            {ICONS.WARNING}
            <span>{error}</span>
          </div>
        </section>
      )}

      {/* Permits Table (Conditionally Rendered) */}
      {isTableVisible && (
        <PermitsTable
          permits={permits}
          onClaimPermit={handleClaimPermit}
          isConnected={isConnected}
          chain={chain}
          // Pass correct confirmation state based on single claim
          isConfirming={isSingleClaimConfirming}
          // Pass appropriate hash for single claim
          confirmingHash={singleClaimHash}
          isLoading={isLoading} // Pass general loading state for table skeleton/message
        />
      )}
    </>
  );
}
