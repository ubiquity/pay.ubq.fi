import { ensLookup } from "../cirip/ens-lookup";
import { currentExplorerUrl } from "../helpers";
import { RewardPermit } from "./tx-type";

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

export async function renderEnsName({ element, address, tokenAddress, tokenView }: EnsParams, reward: RewardPermit): Promise<void> {
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
        href = `${currentExplorerUrl(reward)}/token/${tokenAddress}?a=${address}`;
      } else {
        href = `${currentExplorerUrl(reward)}/address/${address}"`;
      }
      element.innerHTML = `<a target="_blank" rel="noopener noreferrer" href="${href}">${ensName}</a>`;
    }
  } catch (error) {
    console.error(error);
  }
}
