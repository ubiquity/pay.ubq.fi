import { app } from "../app-state";
import { ensLookup } from "../cirip/ens-lookup";

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

// shortens ENS name to a fixed length based on screen size, keeping the ending
function shortenEnsName(ensName: string): string {
  const largeScreenLimit = 40; // max length in chars for large screens
  const smallScreenLimit = 20; // max length in chars for small screens
  const maxWidth = 570; // width trigger

  const parts = ensName.split(".");
  const mainPart = parts.slice(0, -1).join(".");
  const ending = `.${parts[parts.length - 1]}`;

  const maxLength = window.innerWidth >= maxWidth ? largeScreenLimit : smallScreenLimit;

  if (ensName.length <= maxLength) return ensName;

  const maxMainLength = maxLength - ending.length - 3; // subtract space for '...'

  const frontChars = Math.ceil(maxMainLength / 2);
  const backChars = maxMainLength - frontChars;

  const shortenedMain = `${mainPart.slice(0, frontChars)}...${mainPart.slice(-backChars)}`;

  return `${shortenedMain}${ending}`;
}

// update ENS name based on the current window size
function updateEnsNames() {
  const ensElements = document.getElementsByClassName("ens-name");

  Array.from(ensElements).forEach((element) => {
    let fullEnsName = element.getAttribute("data-full-ens-name");
    if (!fullEnsName) {
      fullEnsName = element.innerHTML; // Store the original ENS name
      element.setAttribute("data-full-ens-name", fullEnsName);
    }

    // Use the original ENS name to avoid redundant shortening
    element.innerHTML = shortenEnsName(fullEnsName);
  });
}

// trigger ENS name shortening on window resize
window.addEventListener("resize", updateEnsNames);

export async function renderEnsName({ element, address, tokenAddress, tokenView, networkId }: EnsParams): Promise<void> {
  let href = "";
  try {
    const ensName = await ensLookup(address, networkId);
    if (ensName) {
      if (tokenView) {
        href = `${app.currentExplorerUrl}/token/${tokenAddress}?a=${address}`;
      } else {
        href = `${app.currentExplorerUrl}/address/${address}`;
      }
      // store the full ENS name and apply shortening
      element.setAttribute("data-full-ens-name", ensName);
      element.innerHTML = `<a class="ens-name" target="_blank" rel="noopener noreferrer" href="${href}">${shortenEnsName(ensName)}</a>`;
    }
  } catch (error) {
    console.error(error);
  }
}
