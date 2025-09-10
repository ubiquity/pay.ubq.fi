import { useAccount } from "wagmi"; // Import useAccount hook from wagmi\nimport { useDebug, useDebugLifecycle } from "./hooks/useDebug";

// Import page components
import { LoginPage } from "./components/login-page";
import { DashboardPage } from "./components/dashboard-page";

// Removed GitHubCallback import and related constants/logic

function App() {
  // Use wagmi's useAccount hook to check wallet connection status
  const { isConnected } = useAccount(); // Removed isConnecting, not needed here

  // Render LoginPage if not connected, DashboardPage if connected
  // LoginPage will handle showing its own "Connecting..." state via useConnect status
  return <>{isConnected ? <DashboardPage /> : <LoginPage />}</>;
  // Removed Routes as only the root view is needed now
}

export default App;
