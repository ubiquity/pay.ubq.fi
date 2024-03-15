import { AppState, app } from "../app-state";
import { ensLookup } from "../cirip/ens-lookup";
import { useRpcHandler } from "../web3/use-rpc-handler";

type EnsParams =
  | {
      element: Element;
      address: string;
      tokenAddress: string;
      tokenView: true;
      networkId: number;
    }
  | {
      element: Element;
      address: string;
      networkId: number;
      tokenAddress?: undefined;
      tokenView?: false;
    };

export async function renderEnsName({ element, address, tokenAddress, tokenView, networkId }: EnsParams): Promise<void> {
  let href: string = "";

  const handler = await useRpcHandler({ networkId } as AppState);

  try {
    const resolved = await ensLookup(address, handler);
    let ensName: undefined | string;
    if (resolved.reverseRecord) {
      ensName = resolved.reverseRecord;
    } else if (resolved.domains.length) {
      const domain = resolved.domains.shift();
      if (domain) {
        ensName = domain;
      }
    }
    if (ensName) {
      if (tokenView) {
        href = `${app.currentExplorerUrl}/token/${tokenAddress}?a=${address}`;
      } else {
        href = `${app.currentExplorerUrl}/address/${address}"`;
      }
      element.innerHTML = `<a target="_blank" rel="noopener noreferrer" href="${href}">${ensName}</a>`;
    }
  } catch (error) {
    console.error(error);
  }
}
