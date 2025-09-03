import { useState } from "react";
import type { JSX } from "react";
import type { Address, Chain } from "viem";
import { formatUnits } from "viem";
import { useAccount } from "wagmi";
import { switchChain } from "wagmi/actions";
import { getTokenInfo } from "../constants/supported-reward-tokens.ts";
import { config } from "../main.tsx";
import type { PermitData } from "../types.ts";
import { formatAmount, hasRequiredFields } from "../utils/permit-utils.ts";
import { parseGitHubUrl, truncateAddress } from "../utils/format-utils.ts";
import { ICONS } from "./iconography.tsx";

// Helper function to determine row class name based on permit state
function getRowClassName(permit: PermitData, isInvalidating: boolean): string {
  const isReadyToClaim = hasRequiredFields(permit);
  const isClaimed = permit.claimStatus === "Success" || permit.status === "Claimed" || permit.isNonceUsed === true;
  const isInvalidated = permit.status === "Invalidated";
  const isClaimingThis = permit.claimStatus === "Pending";
  const claimFailed = permit.claimStatus === "Error";
  const insufficientBalance = permit.ownerBalanceSufficient === false;
  const insufficientAllowance = permit.permit2AllowanceSufficient === false;
  const prerequisiteCheckFailed = !!permit.checkError;

  if (!isReadyToClaim) return "row-invalid";
  if (isInvalidating) return "row-invalidating";
  if (isClaimed) return "row-claimed";
  if (isInvalidated) return "row-invalidated";
  if (claimFailed) return "row-claim-failed";
  if (isClaimingThis) return "row-claiming";
  if (insufficientBalance || insufficientAllowance || prerequisiteCheckFailed) return "row-invalid";
  if (permit.status === "Valid") return "row-valid";
  return "";
}

// Helper function to get status display text
function getStatusDisplayText(
  permit: PermitData,
  networkMismatch: boolean,
  targetNetworkName: string,
  isFundingWallet: boolean,
  isInvalidating: boolean
): string {
  const isClaimed = permit.claimStatus === "Success" || permit.status === "Claimed" || permit.isNonceUsed === true;
  const isInvalidated = permit.status === "Invalidated";
  const isClaimingThis = permit.claimStatus === "Pending";
  const claimFailed = permit.claimStatus === "Error";
  const insufficientBalance = permit.ownerBalanceSufficient === false;
  const insufficientAllowance = permit.permit2AllowanceSufficient === false;
  const prerequisiteCheckFailed = !!permit.checkError;

  if (networkMismatch) {
    return `Switch wallet to ${targetNetworkName} to ${isFundingWallet ? "invalidate" : "claim"}`;
  }
  if (isClaimed) return "Claimed";
  if (isInvalidated) return "Invalidated";
  if (isInvalidating) return "Invalidating...";
  if (isClaimingThis) return "Claiming...";
  if (claimFailed) return "Failed";
  if (insufficientBalance) return "Insolvent";
  if (insufficientAllowance) return "Permit2 Allowance Low";
  if (prerequisiteCheckFailed) return "Check Failed";
  if (permit.status === "Valid") return "Valid";
  return permit.status || "";
}

// Helper function to get button text
function getButtonText(
  permit: PermitData,
  isInvalidating: boolean,
  isFundingWallet: boolean,
  canInvalidate: boolean
): string {
  const isClaimed = permit.claimStatus === "Success" || permit.status === "Claimed" || permit.isNonceUsed === true;
  const isInvalidated = permit.status === "Invalidated";
  const isClaimingThis = permit.claimStatus === "Pending";
  const claimFailed = permit.claimStatus === "Error";

  if (isInvalidating) return "Invalidating...";
  if (isFundingWallet && canInvalidate) return "Invalidate";
  if (isInvalidated) return "Invalidated";
  if (isClaimed && permit.transactionHash) return "View";
  if (isClaimingThis) return "Claiming...";
  if (claimFailed && permit.transactionHash) return "View";
  if (claimFailed) return "Retry";
  return "Claim";
}

// Helper function to determine if button is disabled
function getButtonDisabled(
  permit: PermitData,
  networkMismatch: boolean,
  isConnected: boolean,
  isSwitchingNetwork: boolean,
  connector: unknown,
  canSwitchToPermitNetwork: boolean,
  isInvalidating: boolean,
  isFundingWallet: boolean,
  canInvalidate: boolean,
  canAttemptClaim: boolean
): boolean {
  const isClaimed = permit.claimStatus === "Success" || permit.status === "Claimed" || permit.isNonceUsed === true;
  const isInvalidated = permit.status === "Invalidated";
  const isClaimingThis = permit.claimStatus === "Pending";
  const claimFailed = permit.claimStatus === "Error";

  if (networkMismatch) {
    return !isConnected || isSwitchingNetwork || !connector || !canSwitchToPermitNetwork;
  }
  if (isInvalidating) return true;
  if (isFundingWallet && canInvalidate) return !isConnected;
  if (isInvalidated) return true;
  
  return !isConnected ||
    isClaimingThis ||
    (!isClaimed && !canAttemptClaim && !(claimFailed && permit.transactionHash)) ||
    (isClaimed && !permit.transactionHash) ||
    (claimFailed && !permit.transactionHash && !canAttemptClaim);
}

// Helper function to get button icon
function getButtonIcon(
  isInvalidated: boolean,
  isInvalidating: boolean,
  isFundingWallet: boolean,
  canInvalidate: boolean,
  showCannotClaimIcon: boolean
): JSX.Element {
  if (isInvalidated || isInvalidating) return ICONS.WARNING;
  if (isFundingWallet && canInvalidate) return ICONS.WARNING;
  if (showCannotClaimIcon) return ICONS.NO_CLAIM;
  return ICONS.CLAIM;
}

// Helper function to get final button text
function getFinalButtonText(
  networkMismatch: boolean,
  isSwitchingNetwork: boolean,
  targetNetworkName: string,
  buttonText: string
): string {
  if (!networkMismatch) return buttonText;
  if (isSwitchingNetwork) return "Switching...";
  return `Switch to ${targetNetworkName}`;
}

// Helper function to render estimated amount with preferred token
function renderEstimatedAmount(
  permit: PermitData,
  preferredTokenInfo: { symbol: string; decimals: number },
  chain: Chain | undefined
): JSX.Element {
  try {
    const estimatedValueString = formatUnits(BigInt(permit.estimatedAmountOut!), preferredTokenInfo.decimals);
    const numericValue = Number(estimatedValueString);
    const displayValue = isNaN(numericValue)
      ? "Error"
      : numericValue.toLocaleString(undefined, {
          maximumFractionDigits: 2,
          minimumFractionDigits: 0,
        });

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

// Helper function to render original token amount
function renderOriginalAmount(permit: PermitData, chain: Chain | undefined, targetNetworkName: string): JSX.Element {
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
}

interface PermitRowProps {
  readonly permit: PermitData;
  readonly onClaimPermit: (permit: PermitData) => Promise<{ success: boolean; txHash: string }>;
  readonly onInvalidatePermit?: (permit: PermitData) => Promise<{ success: boolean; txHash: string }>;
  readonly isConnected: boolean;
  readonly chain: Chain | undefined;
  readonly isQuoting: boolean;
  readonly preferredRewardTokenAddress: Address | null;
  readonly confirmingHash?: `0x${string}`;
  readonly isFundingWallet?: boolean;
  readonly isInvalidating?: boolean;
  readonly address?: Address;
  readonly githubUsername?: string; // GitHub username for the beneficiary
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

  const networkMismatch = isConnected && chain && permit.networkId !== chain.id;
  const targetNetworkName = switchableChains.find((c: Chain) => c.id === permit.networkId)?.name || `Network ${permit.networkId}`;
  const canSwitchToPermitNetwork = switchableChains.some((c: Chain) => c.id === permit.networkId);

  const rowClassName = getRowClassName(permit, isInvalidating || false);
  const statusDisplayText = getStatusDisplayText(permit, networkMismatch, targetNetworkName, isFundingWallet || false, isInvalidating || false);
  const buttonText = getButtonText(permit, isInvalidating || false, isFundingWallet || false, canInvalidate);
  const isButtonDisabled = getButtonDisabled(
    permit,
    networkMismatch,
    isConnected,
    isSwitchingNetwork,
    connector,
    canSwitchToPermitNetwork,
    isInvalidating || false,
    isFundingWallet || false,
    canInvalidate,
    canAttemptClaim
  );

  const showCannotClaimIcon = !networkMismatch && !canAttemptClaim && !isClaimed && !isClaimingThis && !isFundingWallet && !isInvalidated;
  const showButtonIcon =
    !networkMismatch && !(isClaimed && permit.transactionHash) && !(claimFailed && permit.transactionHash) && !isClaimingThis && !isInvalidating;
  const buttonIcon = getButtonIcon(
    permit.status === "Invalidated",
    isInvalidating || false,
    isFundingWallet || false,
    canInvalidate,
    showCannotClaimIcon
  );

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

  const finalButtonText = getFinalButtonText(networkMismatch, isSwitchingNetwork, targetNetworkName, buttonText);

  const formatGithubLink = (url: string | undefined): JSX.Element => {
    if (!url) {
      return <span>–</span>;
    }
    
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
    
    return <span>Source Link</span>;
  };

  const renderAmount = (): JSX.Element => {
    if (isQuoting && preferredRewardTokenAddress && permit.tokenAddress?.toLowerCase() !== preferredRewardTokenAddress.toLowerCase()) {
      return <span title="Fetching swap quote...">...</span>;
    }

    if (permit.quoteError) {
      return <span title={`Quote Error: ${permit.quoteError}`}>{ICONS.WARNING} Error</span>;
    }

    if (permit.estimatedAmountOut && preferredRewardTokenAddress) {
      const preferredTokenInfo = getTokenInfo(chain?.id, preferredRewardTokenAddress);
      if (preferredTokenInfo) {
        return renderEstimatedAmount(permit, preferredTokenInfo, chain);
      }
    }

    if (permit.type === "erc20-permit" && permit.amount) {
      return renderOriginalAmount(permit, chain, targetNetworkName);
    } else if (permit.type === "erc721-permit") {
      return <span>NFT</span>;
    } else {
      return <span>–</span>;
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
