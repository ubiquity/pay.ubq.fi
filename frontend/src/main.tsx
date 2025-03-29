import { QueryClient, QueryClientProvider } from '@tanstack/react-query'; // Import QueryClient things
import { StrictMode } from 'react'; // Re-add StrictMode import
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { WagmiProvider, createConfig, http } from 'wagmi'; // Re-add http import from wagmi
import { injected } from '@wagmi/connectors'; // Revert to injected connector
import { gnosis, mainnet, optimism } from 'wagmi/chains'; // Import chains used by the app, ADDED optimism
import { RpcHandler } from '@pavlovcik/permit2-rpc-manager'; // Import RpcHandler
import App from './App.tsx';
// Removed AuthProvider import
// import './app-styles.css'; // Import global styles - REMOVED, will link in index.html
// import './ubiquity-styles.css'; // Import ubiquity styles - REMOVED, will link in index.html
// import './grid-styles.css'; // Import grid styles (once) - REMOVED, will link in index.html
import { grid } from './the-grid'; // Import the grid function (once)

// Instantiate and Export RpcHandler
export const rpcHandler = new RpcHandler(); // Added export

// Configure wagmi
// Configure wagmi with injected connector, added Sepolia chain
export const config = createConfig({ // Export config
  chains: [mainnet, gnosis, optimism], // Added optimism
  connectors: [
    injected(), // Use injected connector (removed shimDisconnect)
    // Add WalletConnect, Coinbase Wallet etc. here if needed later
  ],
  transports: {
    // Revert back to default http transports
    [mainnet.id]: http(),
    [gnosis.id]: http(),
    [optimism.id]: http(),
  },
});

// Create QueryClient instance
const queryClient = new QueryClient();

const rootElement = document.getElementById('root');
const gridElement = document.getElementById('grid'); // Get the grid container

if (!rootElement) {
  throw new Error("Could not find root element to mount React app");
}
if (!gridElement) {
  console.warn("Could not find grid element for background animation"); // Warn if grid element is missing
}

createRoot(rootElement).render(
  <StrictMode> {/* Re-enabled StrictMode */}
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        {/* Removed AuthProvider wrapper */}
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </QueryClientProvider>
    </WagmiProvider>
  </StrictMode>
);

// Initialize the grid animation, targeting the #grid div if it exists
if (gridElement) {
  // Call grid with the element and the callback
  grid(gridElement, () => document.body.classList.add("grid-loaded"));
}

// Removed commented out duplicate import and call
