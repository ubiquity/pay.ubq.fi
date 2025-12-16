import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { injected } from "@wagmi/connectors";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { type Chain } from "viem/chains";
import { WagmiProvider, createConfig, http } from "wagmi";
import { anvil, arbitrum, avalanche, base, blast, bsc, celo, gnosis, mainnet, optimism, polygon, zkSync, zora } from "wagmi/chains";
import App from "./App.tsx";
import { RPC_URL } from "./constants/config.ts";
import { grid } from "./the-grid";

const supportedChains = [mainnet, optimism, bsc, gnosis, polygon, zkSync, base, arbitrum, celo, avalanche, blast, zora, anvil];

const transports = supportedChains.reduce(
  (acc, chain) => {
    acc[chain.id] = http(`${RPC_URL}/${chain.id}`);
    return acc;
  },
  {} as Record<number, ReturnType<typeof http>>
);

export const config = createConfig({
  chains: supportedChains as unknown as [Chain, ...Chain[]],
  connectors: [injected()],
  transports: transports,
});

const queryClient = new QueryClient();

const rootElement = document.getElementById("root");
const gridElement = document.getElementById("grid");

if (!rootElement) {
  throw new Error("Could not find root element to mount React app");
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

if (gridElement && window.location.href.includes("pay.ubq.fi")) {
  grid(gridElement, () => document.body.classList.add("grid-loaded"));
}
