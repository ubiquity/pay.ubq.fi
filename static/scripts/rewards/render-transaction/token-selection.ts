import { app } from "../app-state";
import { BigNumberish } from "ethers";
import { renderTokenSymbol } from "./render-token-symbol";

interface Token {
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

// fetch tokens once on load
export async function fetchCowSwapTokens(): Promise<void> {
  try {
    const response = await fetch("http://files.cow.fi/tokens/CowSwap.json");
    const data = await response.json();

    cowSwapTokens = data.tokens;
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

  modal.style.display = "block";

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

  tokenListContainer.innerHTML = "";
  tokens.forEach((token: Token) => {
    const tokenItem: HTMLDivElement = document.createElement("div");
    tokenItem.classList.add("token-item");
    tokenItem.innerHTML = `
      <img src="${token.logoURI}" alt="${token.symbol}" />
      <div>
        <span class="symbol">${token.symbol}</span>
        <span class="name">${token.name}</span>
      </div>
    `;

    if (token.address.toLowerCase() === currentTokenAddress.toLowerCase()) {
      tokenItem.style.backgroundColor = "#2a3550";
    }

    tokenItem.addEventListener("click", async () => {
      if (!currentRenderParams) {
        console.error("Render parameters not found");
        return;
      }

      await renderTokenSymbol({
        table: currentRenderParams.table,
        requestedAmountElement: currentRenderParams.requestedAmountElement,
        tokenAddress: token.address,
        ownerAddress: currentRenderParams.ownerAddress,
        amount: currentRenderParams.amount,
        explorerUrl: currentRenderParams.explorerUrl,
      });

      if (modal) modal.style.display = "none";
    });

    tokenListContainer.appendChild(tokenItem);
  });
}

if (closeModal) {
  closeModal.addEventListener("click", () => {
    if (modal) modal.style.display = "none";
  });
}

window.addEventListener("click", (event: MouseEvent) => {
  if (event.target === modal && modal) {
    modal.style.display = "none";
  }
});
