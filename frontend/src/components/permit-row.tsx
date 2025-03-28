import React from "react";
import type { PermitData } from "../../../shared/types";
import { formatAmount, hasRequiredFields } from "../utils/permit-utils";
import type { Chain } from "viem";

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

  // Determine status text class
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

  // Determine status display text
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

  // Define SVG components
  const ClaimIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" height="18" viewBox="0 -960 960 960" width="18" fill="currentColor">
      <path d="M252.309-180.001q-30.308 0-51.308-21t-21-51.308V-360H240v107.691q0 4.616 3.846 8.463 3.847 3.846 8.463 3.846h455.382q4.616 0 8.463-3.846 3.846-3.847 3.846-8.463V-360h59.999v107.691q0 30.308-21 51.308t-51.308 21H252.309ZM480-335.386 309.233-506.153l42.153-43.383 98.615 98.615v-336.001h59.998v336.001l98.615-98.615 42.153 43.383L480-335.386Z"></path>
    </svg>
  );

  const CannotClaimIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" height="18" viewBox="0 -960 960 960" width="18" fill="currentColor"> {/* Adjusted height/width */}
      <path d="m771.08-104-76.62-76H252.31Q222-180 201-201q-21-21-21-51.31V-330q0-12.77 8.62-21.38Q197.23-360 210-360t21.38 8.62Q240-342.77 240-330v77.69q0 4.62 3.85 8.46 3.84 3.85 8.46 3.85h382.15L513-361.46l-11.15 11.15q-5.62 3.77-10.73 5.46-5.12 1.7-11.5 1.7-8.85 0-14.2-2.62-5.34-2.62-10.34-7.62L330.69-477.38q-8.69-8.7-9-19.54-.3-10.85 6.54-18.92 1.93-1.93 3.85-1.93 1.92 0 3.85 1.93l30.38 30v-22.31L103.39-771.08q-8.7-8.69-8.7-21.07 0-12.39 9.31-21.7 8.69-8.69 21.08-8.69 12.38 0 21.69 8.69l667.08 667.7q8.69 8.69 8.69 21.07 0 12.39-8.69 21.08-9.31 9.31-21.7 9.31-12.38 0-21.07-9.31ZM629.69-524.15q8.69 8.69 8.69 21.07 0 12.39-7.54 19.93l-4.3 4.3q-8.16 8.16-19.93 7.47-11.76-.7-22.23-11.16-8.15-8.15-8.15-19.84 0-11.7 8.15-19.85l3.7-3.69q7.53-7.54 20.23-7.23 12.69.31 21.38 9ZM480-780q12.77 0 21.38 8.62Q510-762.77 510-750v114.62q0 15-9.42 22.19Q491.15-606 480-606q-11.15 0-20.58-7.5Q450-621 450-636v-114q0-12.77 8.62-21.38Q467.23-780 480-780Z"/>
    </svg>
  );

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

      {/* Amount (Reward) Column (Now 2nd) */}
      <td className="align-right monospace">{permit.amount ? formatAmount(permit.amount) : "NFT"}</td>

      {/* Actions Column (Now 3rd) */}
      <td>
        <button
          onClick={() => onClaimPermit(permit)}
          disabled={!isConnected || !canAttemptClaim || isClaimingThis || isClaimed}
          className="button-with-icon" // Apply CSS class
        >
          {showCannotClaimIcon ? <CannotClaimIcon /> : <ClaimIcon />}
          {buttonText}
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

      {/* Status Column (Now 4th/Last) */}
      <td>
        <div className={statusTextClass}>{statusDisplayText}</div>
        {/* Display Prerequisite Check Error */}
        {permit.checkError && !permit.claimError && <div className="status-error extra-small-font margin-top-4">Check Error: {permit.checkError}</div>}
      </td>
    </tr>
  );
}
