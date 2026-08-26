/**
 * UbiquityOS - payout-csv-exporter
 */
export function exportPayoutCsv(rows: Array<{ to: string; amount: string; hash: string }>) { return rows.map(r => `${r.to},${r.amount},${r.hash}`).join("\n"); }
