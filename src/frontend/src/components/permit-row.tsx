import { useState } from "react";
import type { JSX } from "react";
import type { Address, Chain } from "viem";
import { formatUnits } from "viem";
import { useAccount } from "wagmi";
import { switchChain } from "wagmi/actions";
import { NETWORK_NAMES } from "../constants/config.ts";
import { getTokenInfo } from "../constants/supported-reward-tokens.ts";
import { config } from "../main.tsx";
import type { PermitData } from "../types.ts";
import { formatAmount, hasRequiredFields } from "../utils/permit-utils.ts";
import { parseGitHubUrl, truncateAddress } from "../utils/format-utils.ts";
import { ICONS } from "./iconography.tsx";

interface PermitRowProps {
  permit: PermitData;
  onClaimPermit: (permit: PermitData) => Promise<{ success: boolean; txHash: string }>;
  onInvalidatePermit?: (permit: PermitData) => Promise<{ success: boolean; txHash: string }>;
  isConnected: boolean;
  chain: Chain | undefined;
  isQuoting: boolean;
  preferredRewardTokenAddress: Address | null;
  confirmingHash?: `0x${string}`;
  isFundingWallet?: boolean;
  isInvalidating?: boolean;
  address?: Address;
  githubUsername?: string; // GitHub username for the beneficiary
}

export function PermitRow({
  permit,
  onClaimPermit,
  onInvalidatePermit,
  isConnected,
  chain,
  isQuoting,
  preferredRewardTokenAddress,
  isFundingWallet = false,
  isInvalidating = false,
  address,
  githubUsername,
}: PermitRowProps) {
  const { connector } = useAccount();
  const [isSwitchingNetwork, setIsSwitchingNetwork] = useState(false);

  const switchableChains = config.chains ?? [];

  const isReadyToClaim = hasRequiredFields(permit);
  const isClaimed = permit.claimStatus === "Success" || permit.status === "Claimed" || permit.isNonceUsed === true;
  const isInvalidated = permit.status === "Invalidated";
  const isClaimingThis = permit.claimStatus === "Pending";
  const claimFailed = permit.claimStatus === "Error";
  const insufficientBalance = permit.ownerBalanceSufficient === false;
  const insufficientAllowance = permit.permit2AllowanceSufficient === false;
  const prerequisiteCheckFailed = !!permit.checkError;
  const canAttemptClaim =
    isReadyToClaim &&
    !isClaimingThis &&
    !isClaimed &&
    !isInvalidated &&
    (permit.type !== "erc20-permit" || (!insufficientBalance && !insufficientAllowance && !prerequisiteCheckFailed));

  const isOwner = address && permit.owner.toLowerCase() === address.toLowerCase();
  const canInvalidate = isOwner && !isClaimed && !isInvalidated && !isInvalidating;

  const rowClassName = !isReadyToClaim
    ? "row-invalid"
    : isInvalidating
      ? "row-invalidating"
      : isClaimed
        ? "row-claimed"
        : isInvalidated
          ? "row-invalidated"
          : claimFailed
            ? "row-claim-failed"
            : isClaimingThis
              ? "row-claiming"
              : insufficientBalance || insufficientAllowance || prerequisiteCheckFailed
                ? "row-invalid"
                : permit.status === "Valid"
                  ? "row-valid"
                  : "";

  const networkMismatch = isConnected && chain && permit.networkId !== chain.id;
  const targetNetworkName = NETWORK_NAMES[permit.networkId] || `Network ${permit.networkId}`;
  const canSwitchToPermitNetwork = switchableChains.some((c: Chain) => c.id === permit.networkId);

  const statusDisplayText = networkMismatch
    ? `Switch wallet to ${targetNetworkName} to ${isFundingWallet ? "invalidate" : "claim"}`
    : isClaimed
      ? "Claimed"
      : isInvalidated
        ? "Invalidated"
        : isInvalidating
          ? "Invalidating..."
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
                    : permit.status === "Valid"
                      ? "Valid"
                      : permit.status || "";

  const buttonText = isInvalidating
    ? "Invalidating..."
    : isFundingWallet && canInvalidate
      ? "Invalidate"
      : isInvalidated
        ? "Invalidated"
        : isClaimed && permit.transactionHash
          ? "View"
          : isClaimingThis
            ? "Claiming..."
            : claimFailed && permit.transactionHash
              ? "View"
              : claimFailed
                ? "Retry"
                : "Claim";

  const isButtonDisabled = networkMismatch
    ? !isConnected || isSwitchingNetwork || !connector || !canSwitchToPermitNetwork
    : isInvalidating
      ? true
      : isFundingWallet && canInvalidate
        ? !isConnected
        : isInvalidated
          ? true
          : !isConnected ||
            isClaimingThis ||
            (!isClaimed && !canAttemptClaim && !(claimFailed && permit.transactionHash)) ||
            (isClaimed && !permit.transactionHash) ||
            (claimFailed && !permit.transactionHash && !canAttemptClaim);

  const showCannotClaimIcon = !networkMismatch && !canAttemptClaim && !isClaimed && !isClaimingThis && !isFundingWallet && !isInvalidated;
  const showButtonIcon =
    !networkMismatch && !(isClaimed && permit.transactionHash) && !(claimFailed && permit.transactionHash) && !isClaimingThis && !isInvalidating;
  const buttonIcon =
    isInvalidated || isInvalidating ? ICONS.WARNING : isFundingWallet && canInvalidate ? ICONS.WARNING : showCannotClaimIcon ? ICONS.NO_CLAIM : ICONS.CLAIM;

  const handleButtonClick = async () => {
    if (isInvalidated) {
      // Do nothing for invalidated permits
      return;
    }
    if (networkMismatch) {
      if (connector && canSwitchToPermitNetwork && !isSwitchingNetwork) {
        setIsSwitchingNetwork(true);
        try {
          await switchChain(config, { chainId: permit.networkId });
        } catch (error) {
          console.error("Failed to switch network:", error);
          setIsSwitchingNetwork(false);
        }
      }
    } else if ((isClaimed || claimFailed) && permit.transactionHash && chain?.blockExplorers?.default.url) {
      window.open(`${chain.blockExplorers.default.url}/tx/${permit.transactionHash}`, "_blank");
    } else if (isFundingWallet && canInvalidate && onInvalidatePermit) {
      await onInvalidatePermit(permit);
    } else if (!isButtonDisabled && !isFundingWallet) {
      await onClaimPermit(permit);
    }
  };

  const finalButtonText = networkMismatch ? (isSwitchingNetwork ? "Switching..." : `Switch to ${targetNetworkName}`) : buttonText;

  const formatGithubLink = (url: string | undefined): JSX.Element | string => {
    if (!url) return "–";
    try {
      const parsed = parseGitHubUrl(url);
      if (parsed) {
        // Return JSX with proper class names for styling
        return (
          <>
            <span className="github-repo-name">{parsed.repo}</span>
            <span className="github-issue-number">{parsed.number}</span>
            {isFundingWallet && (
              <span title={`Beneficiary wallet: ${permit.beneficiary}`} style={{ cursor: "help" }} className="github-beneficiary">
                {githubUsername ? githubUsername : truncateAddress(permit.beneficiary)}
              </span>
            )}
          </>
        );
      }
    } catch (e) {
      console.error("Error parsing GitHub URL:", e);
    }
    return "Source Link";
  };

  const renderAmount = () => {
    if (isQuoting && preferredRewardTokenAddress && permit.tokenAddress?.toLowerCase() !== preferredRewardTokenAddress.toLowerCase()) {
      return <span title="Fetching swap quote...">...</span>;
    }

    if (permit.quoteError) {
      return <span title={`Quote Error: ${permit.quoteError}`}>{ICONS.WARNING} Error</span>;
    }

    if (permit.estimatedAmountOut && preferredRewardTokenAddress) {
      const preferredTokenInfo = getTokenInfo(chain?.id, preferredRewardTokenAddress);
      if (preferredTokenInfo) {
        try {
          const estimatedValueString = formatUnits(BigInt(permit.estimatedAmountOut), preferredTokenInfo.decimals);
          const numericValue = Number(estimatedValueString);
          const displayValue = isNaN(numericValue) ? "Error" : numericValue.toLocaleString(undefined, { maximumSignificantDigits: 2 });

          const originalTokenInfo = getTokenInfo(chain?.id, permit.tokenAddress as Address);
          const originalSymbol = originalTokenInfo?.symbol || "tokens";
          const originalAmountFormatted = permit.amount && originalTokenInfo ? formatAmount(permit.amount, originalTokenInfo.decimals) : "–";

          const explorerUrl = chain?.blockExplorers?.default?.url;
          const tokenAddress = permit.tokenAddress;
          const ownerAddress = permit.owner;

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

    if (permit.type === "erc20-permit" && permit.amount) {
      const originalTokenInfo = getTokenInfo(permit.networkId, permit.tokenAddress as Address);
      const originalSymbol = originalTokenInfo?.symbol || "tokens";
      if (chain?.blockExplorers?.default.url && permit.owner && permit.tokenAddress) {
        const explorerUrl = chain.blockExplorers.default.url;
        const tokenAddress = permit.tokenAddress;
        const ownerAddress = permit.owner;
        return (
          <button
            className="button-as-link monospace"
            onClick={() => window.open(`${explorerUrl}/token/${tokenAddress}?a=${ownerAddress}`, "_blank")}
            title={`View ${ownerAddress}'s balance for ${originalSymbol} (${tokenAddress}) on ${targetNetworkName}`}
          >
            {originalTokenInfo ? formatAmount(permit.amount, originalTokenInfo.decimals) : "–"} {originalSymbol}
          </button>
        );
      } else {
        return (
          <span title={`Token: ${originalSymbol} (${permit.tokenAddress}) on ${targetNetworkName}`}>
            {originalTokenInfo ? formatAmount(permit.amount, originalTokenInfo.decimals) : "–"} {originalSymbol}
          </span>
        );
      }
    } else if (permit.type === "erc721-permit") {
      return "NFT";
    } else {
      return "–";
    }
  };

  return (
    <div className={`permit-row ${rowClassName}`}>
      {/* 
        Cell Order: Amount | Source | Actions
        This is a headerless design - the data is self-explanatory.
        The cells use flex layout with consistent ordering across all rows.
        CSS classes handle proper alignment: align-right (flex:1), github-comment-url (flex:2), actions-cell (flex:1)
      */}
      <div className="permit-cell align-right monospace">{renderAmount()}</div>

      <div className="permit-cell github-comment-url">
        {permit.githubCommentUrl ? (
          <button
            className="button-as-link"
            onClick={() => window.open(permit.githubCommentUrl, "_blank")}
            title={`View source on GitHub: ${permit.githubCommentUrl}`}
          >
            {formatGithubLink(permit.githubCommentUrl)}
          </button>
        ) : (
          "–"
        )}
      </div>

      <div className="permit-cell actions-cell">
        <button
          onClick={handleButtonClick}
          disabled={isButtonDisabled}
          className={`button-with-icon ${isClaimed && permit.transactionHash ? "view-button" : ""}`}
          title={statusDisplayText}
        >
          {showButtonIcon && buttonIcon}
          <span>{finalButtonText}</span>
        </button>
        {!networkMismatch && permit.claimError && <div className="status-error extra-small-font margin-top-4">Error: {permit.claimError}</div>}
        {!networkMismatch && permit.checkError && <div className="status-error extra-small-font margin-top-4">Check Failed: {permit.checkError}</div>}
        {!permit.claimError && !permit.checkError && permit.testError && (
          <div className="status-test-failed extra-small-font margin-top-4">Test Failed: {permit.testError}</div>
        )}
      </div>
    </div>
  );
}
