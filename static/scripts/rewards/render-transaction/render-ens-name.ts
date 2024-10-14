import { app } from "../app-state";
import { queryReverseEns } from "../cirip/query-reverse-ens";

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
      tokenAddress?: undefined;
      tokenView?: false;
      networkId: number;
    };

export async function renderEnsName({ element, address, tokenAddress, tokenView, networkId }: EnsParams): Promise<void> {
  let href = "";
  try {
    const ensName = await queryReverseEns(address, networkId);

    if (ensName) {
      if (tokenView) {
        href = `${app.currentExplorerUrl}/token/${tokenAddress}?a=${address}`;
      } else {
        href = `${app.currentExplorerUrl}/address/${address}`;
      }
      element.innerHTML = `<a target="_blank" rel="noopener noreferrer" href="${href}">${ensName}</a>`;
    }
  } catch (error) {
    console.error(error);
  }
}
