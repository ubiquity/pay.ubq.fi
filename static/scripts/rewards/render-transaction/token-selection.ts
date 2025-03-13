import { app } from "../app-state";
import { BigNumberish } from "ethers";
import { renderTokenSymbol } from "./render-token-symbol";
import { renderTransaction } from "./render-transaction";

export interface Token {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  chainId: number;
  logoURI: string;
}

const modal: HTMLElement | null = document.getElementById("tokenModal");
const closeModal: HTMLElement | null = modal?.querySelector(".close") ?? null;
const tokenListContainer: HTMLElement | null = document.getElementById("tokenList");
const searchInput: HTMLInputElement | null = document.getElementById("tokenSearch") as HTMLInputElement;

// store renderTokenSymbol params for re-rendering after token selection
interface RenderParams {
  table: Element;
  requestedAmountElement: Element;
  ownerAddress: string;
  amount: BigNumberish;
  explorerUrl: string;
}

let cowSwapTokens: Token[] = [];
let currentRenderParams: RenderParams | null = null;

export function loadSelectedTokens(): { [chainId: number]: Token | null } {
  const stored = localStorage.getItem("selectedTokens");
  return stored ? JSON.parse(stored) : {};
}

function saveSelectedTokens(selectedTokens: { [chainId: number]: Token | null }): void {
  localStorage.setItem("selectedTokens", JSON.stringify(selectedTokens));
}

// Fetch tokens once on load and set initial token from localStorage
export async function fetchCowSwapTokens(): Promise<void> {
  try {
    const response = await fetch("https://files.cow.fi/tokens/CowSwap.json");
    const data = await response.json();

    cowSwapTokens = data.tokens;

    cowSwapTokens.push(
      {
        // UUSD on Gnosis
        address: "0xC6ed4f520f6A4e4DC27273509239b7F8A68d2068",
        symbol: "UUSD",
        name: "Ubiquity Dollar",
        decimals: 18,
        chainId: 100,
        logoURI: "https://etherscan.io/token/images/ubiquitydao2_32.png",
      },
      {
        // UUSD on Mainnet
        address: "0xb6919Ef2ee4aFC163BC954C5678e2BB570c2D103",
        symbol: "UUSD",
        name: "Ubiquity Dollar",
        decimals: 18,
        chainId: 1,
        logoURI: "https://etherscan.io/token/images/ubiquitydao2_32.png",
      },
      {
        // UBQ on Mainnet
        address: "0x4e38D89362f7e5db0096CE44ebD021c3962aA9a0",
        symbol: "UBQ",
        name: "Ubiquity",
        decimals: 18,
        chainId: 1,
        logoURI: "https://etherscan.io/token/images/ubiquitydao3_32.png",
      }
    );

    // load selected tokens from localStorage
    const selectedTokens = loadSelectedTokens();
    const currentChainId = app.reward.networkId;
    let initialToken: Token | null = selectedTokens[currentChainId] || null;

    // if stored value is null, revert to the original reward token
    if (!initialToken) {
      const originalToken = cowSwapTokens.find(
        (token) => token.address.toLowerCase() === app.reward.tokenAddress.toLowerCase() && token.chainId === currentChainId
      );
      initialToken = originalToken || null;
      selectedTokens[currentChainId] = initialToken;
      saveSelectedTokens(selectedTokens);
    }

    // render the initial token
    if (currentRenderParams && initialToken) {
      await renderTokenSymbol({
        ...currentRenderParams,
        tokenAddress: initialToken.address,
      });
    }
  } catch (error) {
    console.error("Error fetching token list:", error);
  }
}

export function openTokenModal(currentTokenAddress: string, renderParams: RenderParams): void {
  if (!modal || !searchInput || !tokenListContainer) {
    console.error("Modal elements not found");
    return;
  }

  currentRenderParams = renderParams;

  modal.classList.add("active");

  const networkTokens = cowSwapTokens.filter((token: Token) => token.chainId === app.reward.networkId);

  renderTokenList(networkTokens, currentTokenAddress);

  // search
  searchInput.value = "";
  searchInput.focus();
  searchInput.addEventListener("input", () => {
    const searchTerm = searchInput.value.toLowerCase();
    const filtered = networkTokens.filter(
      (token: Token) =>
        token.symbol.toLowerCase().includes(searchTerm) || token.name.toLowerCase().includes(searchTerm) || token.address.toLowerCase().includes(searchTerm)
    );
    renderTokenList(filtered, currentTokenAddress);
  });
}

export function renderTokenList(tokens: Token[], currentTokenAddress: string): void {
  if (!tokenListContainer) {
    console.error("Token list container not found");
    return;
  }

  const priorityTokens = ["UUSD", "WXDAI", "DAI", "USDT", "USDC", "USDC.e", "UBQ"];
  tokens.sort((a, b) => {
    if (a.address === currentTokenAddress) return -1;
    if (b.address === currentTokenAddress) return 1;

    if (a.address === app.reward.tokenAddress) return -1;
    if (b.address === app.reward.tokenAddress) return 1;

    const aIndex = priorityTokens.indexOf(a.symbol);
    const bIndex = priorityTokens.indexOf(b.symbol);
    if (aIndex === -1 && bIndex === -1) {
      return a.name.localeCompare(b.name);
    }
    if (aIndex === -1) {
      return 1;
    }
    if (bIndex === -1) {
      return -1;
    }
    return aIndex - bIndex;
  });

  tokenListContainer.innerHTML = "";
  tokens.forEach((token: Token) => {
    const tokenItem: HTMLDivElement = document.createElement("div");
    tokenItem.classList.add("token-item");
    if (token.address.toLowerCase() === app.reward.tokenAddress.toLowerCase()) {
      tokenItem.classList.add("permit-token");
      tokenItem.innerHTML = `
        <img src="${token.logoURI}" alt="${token.symbol}" />
        <div>
          <span class="symbol">${token.symbol}</span>
          <span class="name">${token.name}</span>
        </div>
        <span class="info">Original</span>
      `;
    } else if (token.address.toLowerCase() === currentTokenAddress.toLowerCase()) {
      tokenItem.classList.add("selected-token");
      tokenItem.innerHTML = `
        <img src="${token.logoURI}" alt="${token.symbol}" />
        <div>
          <span class="symbol">${token.symbol}</span>
          <span class="name">${token.name}</span>
        </div>
        <span class="info">Selected</span>
      `;
    } else {
      tokenItem.innerHTML = `
        <img src="${token.logoURI}" alt="${token.symbol}" />
        <div>
          <span class="symbol">${token.symbol}</span>
          <span class="name">${token.name}</span>
        </div>
      `;
    }

    // user selects a token
    tokenItem.addEventListener("click", async () => {
      if (!currentRenderParams) {
        console.error("Render parameters not found");
        return;
      }

      const selectedTokens = loadSelectedTokens();
      const currentChainId = app.reward.networkId;

      selectedTokens[currentChainId] = token;
      saveSelectedTokens(selectedTokens);

      // hide modal
      if (modal) {
        modal.classList.remove("active");
      }

      // set amount to loading
      const requestedAmountElement = document.getElementById("rewardAmount") as Element;
      requestedAmountElement.innerHTML = `<div class="loading-message">Loading</div>`;

      // render transaction again (fetches quote and sets up app state)
      await renderTransaction();
    });

    tokenListContainer.appendChild(tokenItem);
  });
}

if (closeModal) {
  closeModal.addEventListener("click", () => {
    if (modal) {
      modal.classList.remove("active");
    }
  });
}

window.addEventListener("click", (event: MouseEvent) => {
  if (event.target === modal && modal) {
    modal.classList.remove("active");
  }
});
