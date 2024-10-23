import { app } from "../app-state";
import { ensLookup } from "../cirip/ens-lookup";

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
    const ensName = await ensLookup(address);
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
