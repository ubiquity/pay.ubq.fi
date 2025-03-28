import React from 'react'; // Removed unused useEffect import
import { useConnect, useConnectors } from 'wagmi'; // Added useConnectors hook
import logoSvgContent from '../assets/ubiquity-os-logo.svg?raw'; // Import SVG content as raw string
import { ICONS } from './icons'; // Change path back to correct one

// Update props if needed, or remove if connection is handled by context/hooks directly
// interface LoginPageProps {
// }

export function LoginPage(/* Props if needed */) {
  // Use `status` to check connection state
  const { connect, error, status } = useConnect(); // Keep useConnect for connect function and status/error
  const connectors = useConnectors(); // Get connector instances separately

  // Removed debugging logs

  // Create a wrapper span for the SVG content
  const LogoSpan = () => (
    <span
      id="header-logo-wrapper" // Use a wrapper class if needed for positioning/sizing
      dangerouslySetInnerHTML={{ __html: logoSvgContent }}
    />
  );

  // Basic example using wagmi's useConnect hook
  // This assumes connectors are configured in the WagmiConfig provider
  return (
    <div>
      <h1>
        <LogoSpan />
        <span>Ubiquity OS Rewards</span>
      </h1>
      {(() => {
        // Explicitly find the injected connector from useConnectors result
        const injectedConnectorInstance = connectors.find((c) => c.id === 'injected');

        // Removed debugging logs

        if (!injectedConnectorInstance) {
          return <div>Browser wallet connector not found. Please install MetaMask or a similar wallet.</div>;
        }

        // Removed the complex/incorrect features check and unused isReady variable

        // Workaround: Enable button if .ready is undefined but window.ethereum exists
        const isReady = injectedConnectorInstance.ready ?? (typeof window !== 'undefined' && !!window.ethereum);

        return (
          // Match structure from DashboardPage
          <section id="controls">
            <button
              className="button-with-icon" // Add class
              disabled={!isReady || status === 'pending'} // Use the combined readiness check
              key={injectedConnectorInstance.id}
              onClick={() => connect({ connector: injectedConnectorInstance })} // Pass the instance to connect
            >
              {/* Always show icon */}
              {ICONS.CONNECT}
              {/* Ensure span structure is consistent */}
              <span>
                {status === 'pending' ? 'Connecting...' : 'Connect Wallet'}
                {/* Add unsupported text back inside span, only when applicable */}
                {!isReady && status !== 'pending' && ' (unsupported)'}
              </span>
            </button>
          </section>
        );
      })()}
      {/* Show error message if connection fails */}
      {error && <div>{error.message}</div>}
    </div>
  );
} // Added missing closing brace for the component function
// Removed stray ); from the end
