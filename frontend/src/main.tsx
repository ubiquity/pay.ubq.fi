import { QueryClient, QueryClientProvider } from '@tanstack/react-query'; // Import QueryClient things
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { WagmiProvider, createConfig, http } from 'wagmi';
import { gnosis, mainnet } from 'wagmi/chains'; // Import chains used by the app
import App from './App.tsx';
import { AuthProvider } from './auth-context.tsx'; // Import AuthProvider
// import './app-styles.css'; // Import global styles - REMOVED, will link in index.html
// import './ubiquity-styles.css'; // Import ubiquity styles - REMOVED, will link in index.html
// import './grid-styles.css'; // Import grid styles (once) - REMOVED, will link in index.html
import { grid } from './the-grid'; // Import the grid function (once)

// Configure wagmi
// TODO: Consider adding more chains if needed (e.g., localhost for dev)
// TODO: Add connectors (e.g., MetaMask, WalletConnect) if needed beyond default EIP-6963
export const config = createConfig({ // Export config
  chains: [mainnet, gnosis],
  transports: {
    [mainnet.id]: http(), // Uses default public RPC, override if needed
    [gnosis.id]: http(),  // Uses default public RPC, override if needed
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
  <StrictMode>
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}> {/* Wrap AuthProvider */}
        <AuthProvider>
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </AuthProvider>
      </QueryClientProvider>
    </WagmiProvider>
  </StrictMode>,
);

// Initialize the grid animation, targeting the #grid div if it exists
if (gridElement) {
  // Call grid with the element and the callback
  grid(gridElement, () => document.body.classList.add("grid-loaded"));
}

// Removed commented out duplicate import and call
