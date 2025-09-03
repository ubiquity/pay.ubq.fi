import { QueryClient, QueryClientProvider } from "@tanstack/react-query"; // Import QueryClient things
import { StrictMode } from "react"; // Re-add StrictMode import
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { WagmiProvider, createConfig, http } from "wagmi";
import { type Chain } from "viem/chains"; // Import Chain type
import { injected } from "@wagmi/connectors";
import {
  mainnet, // 1
  optimism, // 10
  bsc, // 56
  gnosis, // 100
  polygon, // 137
  zkSync, // 324
  base, // 8453
  arbitrum, // 42161
  celo, // 42220
  avalanche, // 43114
  blast, // 81457
  zora, // 7777777
  anvil, // 31337 (local dev chain)
} from "wagmi/chains";
import App from "./App.tsx";
import { grid } from "./the-grid";

// Configure wagmi
const supportedChains = [mainnet, optimism, bsc, gnosis, polygon, zkSync, base, arbitrum, celo, avalanche, blast, zora, anvil];

// Get base RPC URL from env or use default
import { RPC_URL } from "./constants/config";
const rpcBaseUrl = RPC_URL;

// Dynamically create transports for all supported chains
const transports = supportedChains.reduce(
  (acc, chain) => {
    acc[chain.id] = http(`${rpcBaseUrl}/${chain.id}`);
    return acc;
  },
  {} as Record<number, ReturnType<typeof http>>
);

export const config = createConfig({
  // Export config
  chains: supportedChains as unknown as [Chain, ...Chain[]], // Assert via unknown
  connectors: [
    injected(), // Use injected connector (removed shimDisconnect)
    // Add WalletConnect, Coinbase Wallet etc. here if needed later
  ],
  transports: transports,
});

// Create QueryClient instance
const queryClient = new QueryClient();

const rootElement = document.getElementById("root");
const gridElement = document.getElementById("grid"); // Get the grid container

if (!rootElement) {
  throw new Error("Could not find root element to mount React app");
}
if (!gridElement) {
  console.warn("Could not find grid element for background animation"); // Warn if grid element is missing
}

createRoot(rootElement).render(
  <StrictMode>
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </QueryClientProvider>
    </WagmiProvider>
  </StrictMode>
);

// Initialize the grid animation, targeting the #grid div if it exists
if (gridElement && window.location.href.includes("pay.ubq.fi")) {
  // Call grid with the element and the callback
  grid(gridElement, () => document.body.classList.add("grid-loaded"));
}
