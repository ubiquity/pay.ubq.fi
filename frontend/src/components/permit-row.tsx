import React from "react";
import type { PermitData } from "../../../shared/types";
import { formatAmount, hasRequiredFields } from "../utils/permit-utils";
import type { Chain } from "viem";
import { ICONS } from "./ICONS"; // <-- Correct casing

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
    ? "Claim Failed"
    : insufficientBalance
    ? "Insolvent"
    : insufficientAllowance
    ? "Permit2 Allowance Low"
    : prerequisiteCheckFailed
    ? "Check Failed"
    : permit.status === "TestSuccess" || permit.status === "Valid"
    ? "Valid"
    : permit.status || "";

  // Determine button text
  const buttonText = isClaimed
    ? "Claimed"
    : isClaimingThis
    ? "Claiming..."
    : claimFailed
    ? "Retry Claim"
    : insufficientBalance || insufficientAllowance || prerequisiteCheckFailed
    ? "Claim"
    : "Claim";

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

  // Determine which icon to show
  const showCannotClaimIcon = !canAttemptClaim && !isClaimed && !isClaimingThis;

  return (
    <tr className={rowClassName}>
      {/* Removed Type column */}
      {/* Removed Token Symbol/Network column */}

      {/* Source Column (Now 1st) */}
      <td className="github-comment-url">
        {permit.githubCommentUrl ? (
          <a href={permit.githubCommentUrl} target="_blank" rel="noopener noreferrer">
            {formatGithubLink(permit.githubCommentUrl)} {/* Use the formatted link text */}
          </a>
        ) : (
          "N/A"
        )}
      </td>

      {/* Amount (Reward) Column (Now 2nd) - Button Link to Funder's Token Balance */}
      <td className="align-right monospace">
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
                {formatAmount(amount)}
              </button>
            );
          } else if (permit.type === "erc721-permit") {
            // Display "NFT" for ERC721 permits (no direct balance link)
            return "NFT";
          } else {
            // Fallback for missing data or unknown type
            return permit.amount ? formatAmount(permit.amount) : "N/A";
          }
        })()}
      </td>
      {/* Actions Column (Now 3rd) */}
      <td>
        <button
          onClick={() => onClaimPermit(permit)}
          disabled={!isConnected || !canAttemptClaim || isClaimingThis || isClaimed}
          className="button-with-icon" // Apply CSS class
          title={statusDisplayText} // Add title attribute for tooltip
        >
          {showCannotClaimIcon ? ICONS.NO_CLAIM : ICONS.CLAIM}
          <span>{buttonText}</span>
        </button>
        {/* Display Claim Error */}
        {permit.claimError && <div className="status-error extra-small-font margin-top-4">Error: {permit.claimError}</div>}
        {/* Display Test Error */}
        {!permit.claimError && !permit.checkError && permit.testError && (
          <div className="status-test-failed extra-small-font margin-top-4">Test Failed: {permit.testError}</div>
        )}
        {/* Display Transaction Hash Link */}
        {permit.transactionHash && (
          <div className="extra-small-font margin-top-4">
            <a
              href={`${chain?.blockExplorers?.default.url}/tx/${permit.transactionHash}`}
              target="_blank"
              rel="noopener noreferrer"
              title={permit.transactionHash}
            >
              View Tx {isConfirming && permit.transactionHash === confirmingHash ? "(Confirming...)" : ""}
            </a>
          </div>
        )}
      </td>

      {/* Status Column REMOVED */}
    </tr>
  );
}
