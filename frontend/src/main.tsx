import { QueryClient, QueryClientProvider } from '@tanstack/react-query'; // Import QueryClient things
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { WagmiProvider, createConfig, http } from 'wagmi';
import { gnosis, mainnet } from 'wagmi/chains'; // Import chains used by the app
import App from './App.tsx';
import { AuthProvider } from './auth-context.tsx'; // Import AuthProvider
import './app-styles.css'; // Import global styles
import './ubiquity-styles.css'; // Import global styles

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


createRoot(document.getElementById('root')!).render(
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
