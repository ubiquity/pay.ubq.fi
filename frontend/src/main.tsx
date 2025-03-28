import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { WagmiProvider, createConfig, http } from 'wagmi';
import { gnosis, mainnet } from 'wagmi/chains'; // Import chains used by the app
import App from './App.tsx';
import { AuthProvider } from './auth-context.tsx'; // Import AuthProvider

// Configure wagmi
// TODO: Consider adding more chains if needed (e.g., localhost for dev)
// TODO: Add connectors (e.g., MetaMask, WalletConnect) if needed beyond default EIP-6963
const config = createConfig({
  chains: [mainnet, gnosis],
  transports: {
    [mainnet.id]: http(), // Uses default public RPC, override if needed
    [gnosis.id]: http(),  // Uses default public RPC, override if needed
  },
});


createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <WagmiProvider config={config}>
      <AuthProvider> {/* Wrap BrowserRouter with AuthProvider */}
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </AuthProvider>
    </WagmiProvider>
  </StrictMode>,
);
