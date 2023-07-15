import { ensLookup } from "../cirip/ens-lookup";
import { app } from "./index";

export async function renderEnsName({ element, address, tokenView = false }: { element: Element; address: string; tokenView?: boolean }): Promise<void> {
  // const provider = new ethers.providers.Web3Provider(window.ethereum);
  // const ens = await provider.lookupAddress(address);
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
        href = `${app.explorerUrl}/token/${app.txData.permit.permitted.token}?a=${address}`;
      } else {
        href = `${app.explorerUrl}/address/${address}"`;
      }
      element.innerHTML = `<a target="_blank" rel="noopener noreferrer" href="${href}">${ensName}</a>`;
    }
  } catch (error) {}
}
