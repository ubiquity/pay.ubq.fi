import { ensLookup } from "../cirip/ens-lookup";
import { app } from "./index";

type EnsParams =
  | {
      element: Element;
      address: string;
      tokenAddress: string;
      tokenView: true;
    }
  | {
      element: Element;
      address: string;
      tokenAddress?: undefined;
      tokenView?: false;
    };

export async function renderEnsName({ element, address, tokenAddress, tokenView }: EnsParams): Promise<void> {
  let href: string = "";
  try {
    const resolved = await ensLookup(address);
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
