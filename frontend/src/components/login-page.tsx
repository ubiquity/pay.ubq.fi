import { useConnect, useConnectors } from "wagmi"; // Added useConnectors hook
import logoSvgContent from "../assets/ubiquity-os-logo.svg?raw"; // Import SVG content as raw string
import { ICONS } from "./iconography"; // <-- Correct casing

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
    // Add the section wrapper to match DashboardPage and the logged-out class
    <section id="header" className="header-logged-out">
      <div id="logo-wrapper">
        <h1>
          <LogoSpan />
          <span>Ubiquity OS</span>
          <span>Rewards</span>
        </h1>
      </div>
      {/* Button is placed directly under #header */}
      {(() => {
        // Explicitly find the injected connector from useConnectors result
        const injectedConnectorInstance = connectors.find((c) => c.id === "injected");

        // Removed debugging logs

        if (!injectedConnectorInstance) {
          return <div>Browser wallet connector not found. Please install MetaMask or a similar wallet.</div>;
        }

        // Removed the complex/incorrect features check and unused isReady variable

        // Workaround: Enable button if .ready is undefined but window.ethereum exists
        const isReady = injectedConnectorInstance.ready ?? (typeof window !== "undefined" && !!window.ethereum);

        return (
          // Button is now directly under #header
          <button
            className="button-with-icon" // Add class
            disabled={!isReady || status === "pending"} // Use the combined readiness check
            key={injectedConnectorInstance.id}
            onClick={() => connect({ connector: injectedConnectorInstance })} // Pass the instance to connect
          >
            {/* Conditionally show warning or connect icon */}
            {!isReady ? ICONS.WARNING : ICONS.CONNECT}
            {/* Ensure span structure is consistent */}
            <span>
              {status === "pending"
                ? "Connecting..."
                : !isReady
                ? "Requires Wallet Extension" // New message for !isReady state
                : "Connect Wallet"}
            </span>
          </button>
        );
      })()}
      {/* Show error message if connection fails - keep it outside the header section for now */}
      {error && <div>{error.message}</div>}
    </section>
  );
} // Added missing closing brace for the component function
