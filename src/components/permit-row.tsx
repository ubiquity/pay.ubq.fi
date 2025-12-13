import { useState } from "react";
import type { Address, Chain } from "viem";
import { formatUnits } from "viem";
import { useAccount, useSwitchChain } from "wagmi";
import { NETWORK_NAMES } from "../constants/config.ts";
import { getTokenInfo } from "../constants/supported-reward-tokens.ts";
import { config } from "../main.tsx";
import type { PermitData } from "../types.ts";
import { formatAmount, hasRequiredFields } from "../utils/permit-utils.ts";
import { ICONS } from "./iconography.tsx";

interface PermitRowProps {
  permit: PermitData;
  onClaimPermit: (permit: PermitData) => Promise<{ success: boolean; txHash: string }>;
  isConnected: boolean;
  chain: Chain | undefined;
  isQuoting: boolean;
  preferredRewardTokenAddress: Address | null;
}

export function PermitRow({ permit, onClaimPermit, isConnected, chain, isQuoting, preferredRewardTokenAddress }: PermitRowProps) {
  const { connector } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const [isSwitchingNetwork, setIsSwitchingNetwork] = useState(false);

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

  const rowClassName = (() => {
    if (!isReadyToClaim) return "row-invalid";
    if (isClaimed) return "row-claimed";
    if (claimFailed) return "row-claim-failed";
    if (isClaimingThis) return "row-claiming";
    if (insufficientBalance || insufficientAllowance || prerequisiteCheckFailed) return "row-invalid";
    if (permit.status === "Valid") return "row-valid";
    return "";
  })();

  const networkMismatch = isConnected && chain && permit.networkId !== chain.id;
  const targetNetworkName = NETWORK_NAMES[permit.networkId] || `Network ${permit.networkId}`;
  const canSwitchToPermitNetwork = switchableChains.some((c: Chain) => c.id === permit.networkId);

  const statusDisplayText = (() => {
    if (networkMismatch) return `Switch wallet to ${targetNetworkName} to claim`;
    if (isClaimed) return "Claimed";
    if (isClaimingThis) return "Claiming...";
    if (claimFailed) return "Failed";
    if (insufficientBalance) return "Insolvent";
    if (insufficientAllowance) return "Permit2 Allowance Low";
    if (prerequisiteCheckFailed) return "Check Failed";
    if (permit.status === "Valid") return "Valid";
    return permit.status || "";
  })();

  const buttonText = (() => {
    if ((isClaimed || claimFailed) && permit.transactionHash) return "View";
    if (isClaimingThis) return "Claiming...";
    if (claimFailed) return "Retry";
    return "Claim";
  })();

  const isButtonDisabled = networkMismatch
    ? !isConnected || isSwitchingNetwork || !connector || !canSwitchToPermitNetwork
    : !isConnected ||
      isClaimingThis ||
      (!isClaimed && !canAttemptClaim && !(claimFailed && permit.transactionHash)) ||
      (isClaimed && !permit.transactionHash) ||
      (claimFailed && !permit.transactionHash && !canAttemptClaim);

  const showCannotClaimIcon = !networkMismatch && !canAttemptClaim && !isClaimed && !isClaimingThis;
  const showButtonIcon = !networkMismatch && !(isClaimed && permit.transactionHash) && !(claimFailed && permit.transactionHash) && !isClaimingThis;
  const buttonIcon = showCannotClaimIcon ? ICONS.NO_CLAIM : ICONS.CLAIM;

  const handleButtonClick = async () => {
    if (networkMismatch) {
      if (connector && canSwitchToPermitNetwork && !isSwitchingNetwork) {
        setIsSwitchingNetwork(true);
        try {
          await switchChainAsync({ chainId: permit.networkId });
        } catch (error) {
          console.error("Failed to switch network:", error);
          setIsSwitchingNetwork(false);
        }
      }
    } else if ((isClaimed || claimFailed) && permit.transactionHash && chain?.blockExplorers?.default.url) {
      window.open(`${chain.blockExplorers.default.url}/tx/${permit.transactionHash}`, "_blank");
    } else if (!isButtonDisabled) {
      await onClaimPermit(permit);
    }
  };

  const finalButtonText = networkMismatch ? (isSwitchingNetwork ? "Switching..." : `Switch to ${targetNetworkName}`) : buttonText;

  const formatGithubLink = (url: string | undefined): string => {
    if (!url) return "N/A";
    try {
      const match = url.match(/github\.com\/[^/]+\/([^/]+)\/(issues|pull)\/(\d+)/);
      if (match && match[1]) {
        return match[1];
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
          const originalAmountFormatted = permit.amount && originalTokenInfo ? formatAmount(permit.amount, originalTokenInfo.decimals) : "N/A";

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
            {originalTokenInfo ? formatAmount(permit.amount, originalTokenInfo.decimals) : "N/A"} {originalSymbol}
          </button>
        );
      } else {
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
          "N/A"
        )}
      </div>

      <div className="permit-cell align-right monospace">{renderAmount()}</div>

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
