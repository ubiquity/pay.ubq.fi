import type { PermitData } from "../types";
import { formatAmount, hasRequiredFields } from "../utils/permit-utils";
import type { Chain, Address } from "viem"; // Add Address
import { formatUnits } from "viem"; // Import formatUnits
import { ICONS } from "./iconography";
import { getTokenInfo } from "../constants/supported-reward-tokens"; // Import helper

interface PermitRowProps {
  permit: PermitData;
  onClaimPermit: (permit: PermitData) => void;
  isConnected: boolean;
  chain: Chain | undefined;
  isConfirming: boolean;
  confirmingHash: `0x${string}` | undefined;
  isQuoting: boolean; // Add quoting status prop
  preferredRewardTokenAddress: Address | null; // Add preferred token prop
}

export function PermitRow({ permit, onClaimPermit, isConnected, chain, isConfirming, confirmingHash, isQuoting, preferredRewardTokenAddress }: PermitRowProps) {
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

  // Determine status display text (still needed for button title)
  const statusDisplayText = isClaimed
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
      : "Claim"; // Default/Initial state

  // Determine if the button should be disabled
  const isButtonDisabled =
    !isConnected || // Not connected
    isClaimingThis || // Claiming in progress
    isConfirmingThisPermit || // Confirming in progress
    // Disable if trying to claim but cannot, OR if claimed without hash
    (!isClaimed && !canAttemptClaim && !(claimFailed && permit.transactionHash)) || // Allow clicking "View Failed Tx" even if canAttemptClaim is false now
    (isClaimed && !permit.transactionHash) ||
    // Disable retry if claim failed without a hash and cannot attempt claim now
    (claimFailed && !permit.transactionHash && !canAttemptClaim);

  // Determine which icon to show (Still needed for the NO_CLAIM icon case)
  const showCannotClaimIcon = !canAttemptClaim && !isClaimed && !isClaimingThis;

  // Determine which icon to show (hide for "View", "View Failed Tx", and spinners)
  const showButtonIcon =
    !(isClaimed && permit.transactionHash) && // Not successful View
    !(claimFailed && permit.transactionHash) && // Not failed View
    !isClaimingThis && // Not claiming
    !isConfirmingThisPermit; // Not confirming
  const buttonIcon = showCannotClaimIcon ? ICONS.NO_CLAIM : ICONS.CLAIM;

  // Determine button action
  const handleButtonClick = () => {
    // If claimed OR claim failed WITH a hash, open explorer
    if ((isClaimed || claimFailed) && permit.transactionHash && chain?.blockExplorers?.default.url) {
      window.open(`${chain.blockExplorers.default.url}/tx/${permit.transactionHash}`, "_blank");
    } else if (!isButtonDisabled) {
      // Otherwise, if not disabled, attempt claim (Retry Claim or initial Claim)
      onClaimPermit(permit);
    }
  };

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
        console.log(
          `DEBUG PermitRow ${permit.nonce}: Attempting format. Raw estimatedAmountOut string: '${permit.estimatedAmountOut}', Preferred Token Info:`,
          preferredTokenInfo
        );
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
                <span>
                  ≈ {displayValue} {preferredTokenInfo.symbol}
                </span>
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

    console.trace(permit.amount);

    // 4. Fallback to original amount
    if (permit.type === "erc20-permit" && permit.amount) {
      const originalTokenInfo = getTokenInfo(chain?.id, permit.tokenAddress as Address);
      const originalSymbol = originalTokenInfo?.symbol || "tokens";
      // Link to funder's balance
      if (chain?.blockExplorers?.default.url && permit.owner && permit.tokenAddress) {
        const explorerUrl = chain.blockExplorers.default.url;
        const tokenAddress = permit.tokenAddress;
        const ownerAddress = permit.owner;
        return (
          <button
            className="button-as-link monospace"
              onClick={() => window.open(`${explorerUrl}/token/${tokenAddress}?a=${ownerAddress}`, "_blank")}
              title={`View ${ownerAddress}'s balance for ${originalSymbol} (${tokenAddress})`}
            >
              {/* Use original token's decimals here */}
              {originalTokenInfo ? formatAmount(permit.amount, originalTokenInfo.decimals) : 'N/A'} {originalSymbol}
            </button>
          );
        } else {
        // Fallback if no explorer link possible - use original token's decimals
        return (
          <>
            {originalTokenInfo ? formatAmount(permit.amount, originalTokenInfo.decimals) : 'N/A'} {originalSymbol}
          </>
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
          title={statusDisplayText} // Keep title for context
        >
          {/* Conditionally render icon */}
          {showButtonIcon && buttonIcon}
          <span>{buttonText}</span>
        </button>
        {/* REMOVED Display Claim Error div */}
        {/* Display Test Error (Keep this) */}
        {!permit.claimError && !permit.checkError && permit.testError && (
          <div className="status-test-failed extra-small-font margin-top-4">Test Failed: {permit.testError}</div>
        )}
        {/* REMOVED the separate Transaction Hash Link */}
      </div>
    </div>
  );
}
