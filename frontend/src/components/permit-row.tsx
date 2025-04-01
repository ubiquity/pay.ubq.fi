import type { PermitData } from "../types";
import { formatAmount, hasRequiredFields } from "../utils/permit-utils";
import type { Chain } from "viem";
import { ICONS } from "./iconography"; // <-- Correct casing

interface PermitRowProps {
  permit: PermitData;
  onClaimPermit: (permit: PermitData) => void;
  isConnected: boolean;
  chain: Chain | undefined;
  isConfirming: boolean;
  confirmingHash: `0x${string}` | undefined;
}

export function PermitRow({ permit, onClaimPermit, isConnected, chain, isConfirming, confirmingHash }: PermitRowProps) {
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

  // Determine status text class - REMOVED as the status column is gone
  /*
  const statusTextClass = ` ${
    isClaimed
      ? "status-claimed"
      : claimFailed
      ? "status-error"
      : isClaimingThis
      ? "status-claiming"
      : insufficientBalance || insufficientAllowance || prerequisiteCheckFailed
      ? "status-error"
      : permit.status === "TestSuccess" || permit.status === "Valid"
      ? "status-claimed"
      : permit.status === "TestFailed"
      ? "status-error"
      : permit.status === "Testing"
      ? "status-claiming"
      : "subtle-text"
  }
                           ${
                             permit.claimStatus !== "Idle" ||
                             permit.status === "Claimed" ||
                             permit.status === "TestSuccess" ||
                             permit.status === "Valid" ||
                             insufficientBalance ||
                             insufficientAllowance ||
                             prerequisiteCheckFailed
                               ? "bold-text"
                               : ""
                           }`;
  */

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
  const buttonText = isClaimed && permit.transactionHash
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

  // Removed the misplaced declaration from here

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

      {/* Amount (Reward) Column (Now 2nd) - Button Link to Funder's Token Balance */}
      <div className="permit-cell align-right monospace">
        {(() => {
          // Check conditions and assign URL to a variable for type safety in onClick
          if (permit.type === "erc20-permit" && chain?.blockExplorers?.default.url && permit.owner && permit.tokenAddress && permit.amount) {
            const explorerUrl = chain.blockExplorers.default.url; // Guaranteed to be defined here
            const tokenAddress = permit.tokenAddress;
            const ownerAddress = permit.owner;
            const amount = permit.amount; // Guaranteed to be defined here

            return (
              // Button linking to specific token balance for ERC20 permits
              <button
                className="button-as-link monospace" // Add class for styling
                onClick={() => window.open(`${explorerUrl}/token/${tokenAddress}?a=${ownerAddress}`, "_blank")}
                title={`View ${ownerAddress}'s balance for token ${tokenAddress}`}
              >
                {/* Add UUSD icon before the amount */}
                {ICONS.UUSD}
                {formatAmount(amount)}
              </button>
            );
          } else if (permit.type === "erc721-permit") {
            // Display "NFT" for ERC721 permits (no direct balance link)
            return "NFT";
          } else {
            // Fallback for missing data or unknown type - include icon if amount exists
            return permit.amount ? <>{ICONS.UUSD}{formatAmount(permit.amount)}</> : "N/A";
          }
        })()}
      </div>

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
