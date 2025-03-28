import React from 'react';
import type { PermitData } from '../../../shared/types';
import { formatAmount, hasRequiredFields } from '../utils/permit-utils';
import type { Chain } from 'viem';

interface PermitRowProps {
  permit: PermitData;
  onClaimPermit: (permit: PermitData) => void;
  isConnected: boolean;
  chain: Chain | undefined;
  isConfirming: boolean;
  confirmingHash: `0x${string}` | undefined;
}

export function PermitRow({
  permit,
  onClaimPermit,
  isConnected,
  chain,
  isConfirming,
  confirmingHash,
}: PermitRowProps) {
  const isReadyToClaim = hasRequiredFields(permit);
  const isClaimed = permit.claimStatus === 'Success' || permit.status === 'Claimed';
  const isClaimingThis = permit.claimStatus === 'Pending';
  const claimFailed = permit.claimStatus === 'Error';
  const insufficientBalance = permit.ownerBalanceSufficient === false;
  const insufficientAllowance = permit.permit2AllowanceSufficient === false;
  const prerequisiteCheckFailed = !!permit.checkError;
  const canAttemptClaim = isReadyToClaim && !isClaimingThis && !isClaimed &&
                          (permit.type !== 'erc20-permit' || (!insufficientBalance && !insufficientAllowance && !prerequisiteCheckFailed));

  // Determine row class based on state
  const rowClassName = !isReadyToClaim ? 'row-invalid' :
                       isClaimed ? 'row-claimed' :
                       claimFailed ? 'row-claim-failed' :
                       isClaimingThis ? 'row-claiming' :
                       (insufficientBalance || insufficientAllowance || prerequisiteCheckFailed) ? 'row-invalid' :
                       (permit.status === 'TestSuccess' || permit.status === 'Valid') ? 'row-valid' :
                       permit.status === 'TestFailed' ? 'row-invalid' :
                       '';

  // Determine status text class
  const statusTextClass = ` ${isClaimed ? 'status-claimed' :
                             claimFailed ? 'status-error' :
                             isClaimingThis ? 'status-claiming' :
                             (insufficientBalance || insufficientAllowance || prerequisiteCheckFailed) ? 'status-error' :
                             (permit.status === 'TestSuccess' || permit.status === 'Valid') ? 'status-claimed' :
                             permit.status === 'TestFailed' ? 'status-error' :
                             permit.status === 'Testing' ? 'status-claiming' :
                             'subtle-text'}
                           ${permit.claimStatus !== 'Idle' || permit.status === 'Claimed' || permit.status === 'TestSuccess' || permit.status === 'Valid' || insufficientBalance || insufficientAllowance || prerequisiteCheckFailed ? 'bold-text' : ''}`;

  // Determine status display text
  const statusDisplayText = isClaimed ? 'Claimed' :
                            isClaimingThis ? 'Claiming...' :
                            claimFailed ? 'Claim Failed' :
                            insufficientBalance ? 'Owner Balance Low' :
                            insufficientAllowance ? 'Permit2 Allowance Low' :
                            prerequisiteCheckFailed ? 'Check Failed' :
                            (permit.status === 'TestSuccess' || permit.status === 'Valid') ? 'Valid' :
                            permit.status || 'Ready';

  // Determine button text
  const buttonText = isClaimed ? 'Claimed' :
                     isClaimingThis ? 'Claiming...' :
                     claimFailed ? 'Retry Claim' :
                     (insufficientBalance || insufficientAllowance || prerequisiteCheckFailed) ? 'Cannot Claim' :
                     'Claim';

  return (
    <tr className={rowClassName}>
      <td>
        {permit.amount ? 'ERC20' : 'NFT'}
      </td>
      <td className="monospace small-font">
        {permit.token?.address || permit.tokenAddress || 'Missing Address'}
        {permit.networkId && <span className="extra-small-font subtle-text margin-left-5">
          ({permit.networkId === 100 ? 'WXDAI' : 'ETH'})
        </span>}
      </td>
      <td className="align-right monospace">
        {permit.amount ? formatAmount(permit.amount) : 'NFT'}
      </td>
      <td className="monospace small-font">{permit.beneficiary}</td>
      <td>
        <div className={statusTextClass}>
          {statusDisplayText}
        </div>
        {/* Display Prerequisite Check Error */}
        {permit.checkError && !permit.claimError && (
          <div className="status-error extra-small-font margin-top-4">
            Check Error: {permit.checkError}
          </div>
        )}
      </td>
      <td>
        {permit.githubCommentUrl ? (
          <a href={permit.githubCommentUrl} target="_blank" rel="noopener noreferrer">Comment</a>
        ) : (
          'N/A'
        )}
      </td>
      <td>
        <button
          onClick={() => onClaimPermit(permit)}
          disabled={!isConnected || !canAttemptClaim || isClaimingThis || isClaimed}
        >
          {buttonText}
        </button>
        {/* Display Claim Error */}
        {permit.claimError && (
          <div className="status-error extra-small-font margin-top-4">
            Error: {permit.claimError}
          </div>
        )}
        {/* Display Test Error */}
        {!permit.claimError && !permit.checkError && permit.testError && (
          <div className="status-test-failed extra-small-font margin-top-4">
            Test Failed: {permit.testError}
          </div>
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
              View Tx {isConfirming && permit.transactionHash === confirmingHash ? '(Confirming...)' : ''}
            </a>
          </div>
        )}
      </td>
    </tr>
  );
}
