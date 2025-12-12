// ClaimAllProgress: Progress UI for batch claiming permits

import type { PermitData } from "../types.ts";

interface ClaimAllProgressProps {
  permits: PermitData[];
}

export function ClaimAllProgress({ permits }: ClaimAllProgressProps) {
  const queued = permits.filter(p => p.claimStatus === "Idle").length;
  const pending = permits.filter(p => p.claimStatus === "Pending").length;
  const succeeded = permits.filter(p => p.claimStatus === "Success").length;
  const failed = permits.filter(p => p.claimStatus === "Error").length;
  const totalClaimed = permits
    .filter(p => p.claimStatus === "Success" && p.amount)
    .reduce((sum, p) => sum + Number(p.amount), 0);

  return (
    <div className="claim-all-progress" style={{ marginBottom: 16 }}>
      <div>
        <strong>Queued:</strong> {queued} &nbsp;
        <strong>Pending:</strong> {pending} &nbsp;
        <strong>Succeeded:</strong> {succeeded} &nbsp;
        <strong>Failed:</strong> {failed}
      </div>
      <div>
        <strong>Total Tokens Claimed:</strong> {totalClaimed}
      </div>
    </div>
  );
}
