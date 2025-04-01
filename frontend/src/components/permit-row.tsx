import type { PermitData } from "../types";
import { formatAmount, hasRequiredFields } from "../utils/permit-utils";
import { useState } from "react"; // Import useState
import type { Chain, Address } from "viem";
import { formatUnits } from "viem";
import { useAccount } from "wagmi"; // Import useAccount to get connector
import { switchNetwork } from "wagmi/actions"; // Import the action directly
import { config } from "../main"; // Import the wagmi config
import { ICONS } from "./iconography";
import { getTokenInfo } from "../constants/supported-reward-tokens";
import { NETWORK_NAMES } from "../constants/config";

interface PermitRowProps {
  permit: PermitData;
  onClaimPermit: (permit: PermitData) => void;
  isConnected: boolean;
  chain: Chain | undefined;
  isConfirming: boolean;
  confirmingHash: `0x${string}` | undefined;
  isQuoting: boolean;
  preferredRewardTokenAddress: Address | null;
}

export function PermitRow({ permit, onClaimPermit, isConnected, chain, isConfirming, confirmingHash, isQuoting, preferredRewardTokenAddress }: PermitRowProps) {
  // Workaround: Use switchNetwork action directly instead of the hook
  const { connector } = useAccount(); // Get the active connector
  const [isSwitchingNetwork, setIsSwitchingNetwork] = useState(false); // Local loading state

  // Get switchable chains from the config
  const switchableChains = config.chains ?? [];

  const isReadyToClaim = hasRequiredFields(permit);
  const isClaimed = permit.claimStatus === "Success" || permit.status === "Claimed";
  const isClaimingThis = permit.claimStatus === "Pending";
  const claimFailed = permit.claimStatus === "Error";
  const insufficientBalance = permit.ownerBalanceSufficient === false;
  const insufficientAllowance = permit.permit2AllowanceSufficient === false;
  const prerequisiteCheckFailed = !!permit.checkError;
  const canAttemptClaim =
    isReadyToClaim &&
    !isClaimingThis &&
    !isClaimed &&
    (permit.type !== "erc20-permit" || (!insufficientBalance && !insufficientAllowance && !prerequisiteCheckFailed));

  // Determine row class based on state
  const rowClassName = !isReadyToClaim
    ? "row-invalid"
    : isClaimed
    ? "row-claimed"
    : claimFailed
    ? "row-claim-failed"
    : isClaimingThis
    ? "row-claiming"
    : insufficientBalance || insufficientAllowance || prerequisiteCheckFailed
    ? "row-invalid"
    : permit.status === "TestSuccess" || permit.status === "Valid"
    ? "row-valid"
    : permit.status === "TestFailed"
    ? "row-invalid"
    : "";

  // --- Network Mismatch Check ---
  const networkMismatch = isConnected && chain && permit.networkId !== chain.id;
  const targetNetworkName = NETWORK_NAMES[permit.networkId] || `Network ${permit.networkId}`;
  // Add explicit type 'Chain' to parameter 'c'
  const canSwitchToPermitNetwork = switchableChains.some((c: Chain) => c.id === permit.networkId);

  // Determine status display text (button title)
  const statusDisplayText = networkMismatch
    ? `Switch wallet to ${targetNetworkName} to claim`
    : isClaimed
    ? "Claimed"
    : isClaimingThis
    ? "Claiming..."
    : claimFailed
    ? "Failed"
    : insufficientBalance
    ? "Insolvent"
    : insufficientAllowance
    ? "Permit2 Allowance Low"
    : prerequisiteCheckFailed
    ? "Check Failed"
    : permit.status === "TestSuccess" || permit.status === "Valid"
    ? "Valid"
    : permit.status || "";

  // --- Button Logic ---
  const isConfirmingThisPermit = isConfirming && permit.transactionHash === confirmingHash;

  // Determine button text based on multiple states
  const buttonText =
    isClaimed && permit.transactionHash
      ? "View" // Final state: View Tx
      : isConfirmingThisPermit
      ? "Confirming..." // Confirmation in progress
      : isClaimingThis
      ? "Claiming..." // Initial claim submission
      : claimFailed && permit.transactionHash // Claim failed *with* a hash
      ? "View"
      : claimFailed // Claim failed *without* a hash (e.g., simulation error)
      ? "Retry"
      : "Claim"; // Default/Initial state for non-mismatch case

  // Determine if the button should be disabled
  const isButtonDisabled = networkMismatch
    ? !isConnected || isSwitchingNetwork || !connector || !canSwitchToPermitNetwork // Disable if switching, no connector, or cannot switch
    : !isConnected || // Not connected (original logic)
      isClaimingThis || // Claiming in progress
      isConfirmingThisPermit || // Confirming in progress
      // Disable if trying to claim but cannot, OR if claimed without hash
      (!isClaimed && !canAttemptClaim && !(claimFailed && permit.transactionHash)) || // Allow clicking "View Failed Tx" even if canAttemptClaim is false now
      (isClaimed && !permit.transactionHash) ||
      // Disable retry if claim failed without a hash and cannot attempt claim now
      (claimFailed && !permit.transactionHash && !canAttemptClaim);

  // Determine which icon to show
  const showCannotClaimIcon = !networkMismatch && !canAttemptClaim && !isClaimed && !isClaimingThis; // Only show NO_CLAIM if network matches but cannot claim

  // Determine which icon to show (hide for "View", "View Failed Tx", spinners, and network switch)
  const showButtonIcon =
    !networkMismatch && // Hide icon if switching network
    !(isClaimed && permit.transactionHash) && // Not successful View
    !(claimFailed && permit.transactionHash) && // Not failed View
    !isClaimingThis && // Not claiming
    !isConfirmingThisPermit; // Not confirming
  const buttonIcon = showCannotClaimIcon ? ICONS.NO_CLAIM : ICONS.CLAIM; // Use original icon logic when shown

  // Determine button action
  const handleButtonClick = async () => { // Make async for action call
    if (networkMismatch) {
      if (connector && canSwitchToPermitNetwork && !isSwitchingNetwork) {
        setIsSwitchingNetwork(true);
        try {
          // Call the action directly, passing the config
          await switchNetwork(config, { chainId: permit.networkId });
          // No need to set loading false here, as component will re-render on network change
        } catch (error) {
          console.error("Failed to switch network:", error);
          setIsSwitchingNetwork(false); // Reset loading state on error
        }
        // Do not set isSwitchingNetwork(false) on success immediately,
        // let the network change trigger re-renders.
      }
    } else if ((isClaimed || claimFailed) && permit.transactionHash && chain?.blockExplorers?.default.url) {
      // If claimed OR claim failed WITH a hash, open explorer (original logic)
      window.open(`${chain.blockExplorers.default.url}/tx/${permit.transactionHash}`, "_blank");
    } else if (!isButtonDisabled) {
      // Otherwise, if not disabled, attempt claim (Retry Claim or initial Claim - original logic)
      onClaimPermit(permit);
    }
  };

  // Determine final button text based on network mismatch and other states
  const finalButtonText = networkMismatch
    ? isSwitchingNetwork
      ? "Switching..."
      : `Switch to ${targetNetworkName}`
    : buttonText; // Use original buttonText logic if networks match

  // Function to parse GitHub URL and return formatted string
  const formatGithubLink = (url: string | undefined): string => {
    if (!url) return "N/A";
    try {
      // Regex to capture repo name and issue number from GitHub issue URL
      const match = url.match(/github\.com\/[^/]+\/([^/]+)\/issues\/(\d+)/);
      if (match && match[1]) {
        return match[1]; // Format as repo#issue
      }
    } catch (e) {
      console.error("Error parsing GitHub URL:", e);
    }
    // Fallback if parsing fails or URL is unexpected
    return "Source Link"; // Fallback text
  };

  // --- Amount Display Logic ---
  const renderAmount = () => {
    // 1. Check if quoting is in progress
    if (isQuoting && preferredRewardTokenAddress && permit.tokenAddress?.toLowerCase() !== preferredRewardTokenAddress.toLowerCase()) {
      return <span title="Fetching swap quote...">...</span>;
    }

    // 2. Check for quote error
    if (permit.quoteError) {
      return <span title={`Quote Error: ${permit.quoteError}`}>{ICONS.WARNING} Error</span>;
    }

    // 3. Check if estimated amount exists (quote successful, swap needed)
    if (permit.estimatedAmountOut && preferredRewardTokenAddress) {
      const preferredTokenInfo = getTokenInfo(chain?.id, preferredRewardTokenAddress);
      if (preferredTokenInfo) {
        // **** Add More Logging ****
        // console.log(
        //   `DEBUG PermitRow ${permit.nonce}: Attempting format. Raw estimatedAmountOut string: '${permit.estimatedAmountOut}', Preferred Token Info:`,
        //   preferredTokenInfo
        // );
        // **** End Logging ****
        try {
          // formatUnits returns a string representation of the decimal value
          // Use the correct decimals for the preferred token
          const estimatedValueString = formatUnits(BigInt(permit.estimatedAmountOut), preferredTokenInfo.decimals);

          // Determine appropriate display precision
          // Apply toLocaleString with maximumSignificantDigits: 2
          const numericValue = Number(estimatedValueString);
          const displayValue = isNaN(numericValue) ? "Error" : numericValue.toLocaleString(undefined, { maximumSignificantDigits: 2 });

          // Show original amount in tooltip - use original token's decimals
          const originalTokenInfo = getTokenInfo(chain?.id, permit.tokenAddress as Address);
          const originalSymbol = originalTokenInfo?.symbol || "tokens";
          const originalAmountFormatted = permit.amount && originalTokenInfo ? formatAmount(permit.amount, originalTokenInfo.decimals) : "N/A";

          // Safely access explorer URL
          const explorerUrl = chain?.blockExplorers?.default?.url;
          const tokenAddress = permit.tokenAddress;
          const ownerAddress = permit.owner;

          // Conditionally render button only if explorer URL is available
          if (explorerUrl && tokenAddress && ownerAddress) {
            return (
              <button
                className="button-as-link monospace"
                onClick={() => window.open(`${explorerUrl}/token/${tokenAddress}?a=${ownerAddress}`, "_blank")}
                title={`Original: ${originalAmountFormatted} ${originalSymbol}. Click to view balance on explorer.`}
              >
                ≈ {displayValue} {preferredTokenInfo.symbol}
              </button>
            );
          } else {
            // Fallback: Render text without link if explorer URL is unavailable
            return (
              <span className="monospace" title={`Original: ${originalAmountFormatted} ${originalSymbol}`}>
                ≈ {displayValue} {preferredTokenInfo.symbol}
              </span>
            );
          }
        } catch (e) {
          console.error("Error formatting estimated amount:", e);
          return <span title="Error formatting estimated amount">{ICONS.WARNING} Format Error</span>;
        }
      }
    }

    // 4. Fallback to original amount
    if (permit.type === "erc20-permit" && permit.amount) {
      // IMPORTANT: Use permit.networkId here to get correct token info, regardless of connected chain
      const originalTokenInfo = getTokenInfo(permit.networkId, permit.tokenAddress as Address);
      const originalSymbol = originalTokenInfo?.symbol || "tokens";
      // Link to funder's balance - Use the block explorer for the *permit's* network if possible
      // We don't have easy access to the permit's chain explorer URL here, so we link based on the *connected* chain's explorer for simplicity,
      // but the link might not work correctly if networks mismatch. The title clarifies the target.
      // A better solution would involve passing down chain data for all relevant networks.
      if (chain?.blockExplorers?.default.url && permit.owner && permit.tokenAddress) {
        const explorerUrl = chain.blockExplorers.default.url; // Use connected chain's explorer for link
        const tokenAddress = permit.tokenAddress;
        const ownerAddress = permit.owner;
        return (
          <button
            className="button-as-link monospace"
            onClick={() => window.open(`${explorerUrl}/token/${tokenAddress}?a=${ownerAddress}`, "_blank")}
            // Title should reflect the actual token and owner on the permit's network
            title={`View ${ownerAddress}'s balance for ${originalSymbol} (${tokenAddress}) on ${targetNetworkName}`}
          >
            {/* Use original token's decimals here */}
            {originalTokenInfo ? formatAmount(permit.amount, originalTokenInfo.decimals) : "N/A"} {originalSymbol}
          </button>
        );
      } else {
        // Fallback if no explorer link possible - use original token's decimals
        return (
          <span title={`Token: ${originalSymbol} (${permit.tokenAddress}) on ${targetNetworkName}`}>
            {originalTokenInfo ? formatAmount(permit.amount, originalTokenInfo.decimals) : "N/A"} {originalSymbol}
          </span>
        );
      }
    } else if (permit.type === "erc721-permit") {
      return "NFT";
    } else {
      return "N/A";
    }
  };

  return (
    <div className={`permit-row ${rowClassName}`}>
      {/* Source Column (Now 1st) */}
      <div className="permit-cell github-comment-url">
        {permit.githubCommentUrl ? (
          <button
            className="button-as-link" // Use button styling
            onClick={() => window.open(permit.githubCommentUrl, "_blank")} // Open link on click
            title={`View source on GitHub: ${permit.githubCommentUrl}`} // Add a descriptive title
          >
            {formatGithubLink(permit.githubCommentUrl)} {/* Use the formatted link text */}
          </button>
        ) : (
          "N/A"
        )}
      </div>

      {/* Amount (Reward) Column (Now 2nd) */}
      <div className="permit-cell align-right monospace">{renderAmount()}</div>

      {/* Actions Column (Now 3rd) */}
      <div className="permit-cell actions-cell">
        <button
          onClick={handleButtonClick} // Use the new handler
          disabled={isButtonDisabled} // Use the new disabled logic
          className={`button-with-icon ${isClaimed && permit.transactionHash ? "view-button" : ""}`} // Add class for View state
          title={statusDisplayText} // Use updated statusDisplayText for title
        >
          {/* Conditionally render icon */}
          {showButtonIcon && buttonIcon}
          <span>{finalButtonText}</span> {/* Use finalButtonText */}
        </button>
        {/* Display Claim Error (Only if network matches) */}
        {!networkMismatch && permit.claimError && <div className="status-error extra-small-font margin-top-4">Error: {permit.claimError}</div>}
        {/* Display Check Error (Only if network matches) */}
        {!networkMismatch && permit.checkError && <div className="status-error extra-small-font margin-top-4">Check Failed: {permit.checkError}</div>}
        {/* Display Test Error (Keep this) */}
        {!permit.claimError && !permit.checkError && permit.testError && (
          <div className="status-test-failed extra-small-font margin-top-4">Test Failed: {permit.testError}</div>
        )}
        {/* REMOVED the separate Transaction Hash Link */}
      </div>
    </div>
  );
}
