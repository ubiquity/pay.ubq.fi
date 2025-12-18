import { NETWORK_NAMES } from "../constants/config.ts";
import { config } from "../main.tsx";
import { truncateAddress } from "../utils/format-utils.ts";

interface TxBannerProps {
  txHash: string;
  chainId: number;
  label: string;
  onDismiss: () => void;
}

export function TxBanner({ txHash, chainId, label, onDismiss }: TxBannerProps) {
  const chain = config.chains?.find((c) => c.id === chainId);
  const explorerBaseUrl = chain?.blockExplorers?.default?.url;
  const txUrl = explorerBaseUrl ? `${explorerBaseUrl}/tx/${txHash}` : null;

  const networkName = NETWORK_NAMES[chainId] ?? chain?.name ?? `Chain ${chainId}`;
  const shortHash = truncateAddress(txHash, 6, 4);

  return (
    <section id="tx-banner-wrapper">
      <div className="tx-banner">
        <div className="tx-banner-content">
          <div className="tx-banner-title">{label}</div>
          <div className="tx-banner-meta">
            <span className="tx-banner-network">
              {networkName} ({chainId})
            </span>
            <span className="tx-banner-hash" title={txHash}>
              {shortHash}
            </span>
            {txUrl && (
              <a className="tx-banner-link" href={txUrl} target="_blank" rel="noreferrer">
                View on explorer
              </a>
            )}
          </div>
        </div>
        <button type="button" className="tx-banner-dismiss" onClick={onDismiss} aria-label="Dismiss last transaction banner">
          ×
        </button>
      </div>
    </section>
  );
}
