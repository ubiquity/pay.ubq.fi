import { useEffect, useState } from 'react';
import { Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { useAccount, useConnect, useDisconnect } from 'wagmi';
import { injected } from 'wagmi/connectors'; // Example connector
import type { PermitData } from '../../shared/types'; // Import shared type
import { useAuth } from './auth-context'; // Import useAuth hook

// --- Configuration ---
// Vite automatically loads variables prefixed with VITE_ from .env files
const GITHUB_CLIENT_ID = import.meta.env.VITE_GITHUB_CLIENT_ID;
const BACKEND_API_URL = import.meta.env.VITE_BACKEND_API_URL || 'http://localhost:8000'; // Default if not set

if (!GITHUB_CLIENT_ID) {
  console.error("Error: VITE_GITHUB_CLIENT_ID is not defined in your .env file.");
  // Optionally, you could throw an error or display a message to the user
}

const GITHUB_REDIRECT_URI = `${window.location.origin}/github/callback`;
const GITHUB_AUTH_URL = `https://github.com/login/oauth/authorize?client_id=${GITHUB_CLIENT_ID}&redirect_uri=${encodeURIComponent(GITHUB_REDIRECT_URI)}&scope=read:user`; // Add more scopes if needed (e.g., repo access for scanning?)

// --- Components ---

function LoginPage({ onLogin }: { onLogin: () => void }) {
  return (
    <div>
      <h1>Permit Claiming App</h1>
      <button onClick={onLogin}>Login with GitHub</button>
    </div>
  );
}

function DashboardPage() {
  // Placeholder state for permits etc. - Move state management here or context
  const [permits, setPermits] = useState<PermitData[]>([]); // Use shared type
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // TODO: Implement function to fetch permits from backend API
  const fetchPermits = async () => {
    setIsLoading(true);
    setError(null);
    console.log("TODO: Fetch permits from backend API");
    try {
      // const token = localStorage.getItem('sessionToken');
      // if (!token) throw new Error("Not authenticated");
      // const response = await fetch(`${BACKEND_API_URL}/api/permits`, {
      //   headers: { 'Authorization': `Bearer ${token}` }
      // });
      // if (!response.ok) {
      //   throw new Error('Failed to fetch permits');
      // }
      // const data = await response.json();
      // setPermits(data.permits || []); // Assuming API returns { permits: [...] }
      setPermits([]); // Placeholder
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unknown error occurred');
      console.error("Error fetching permits:", err);
    } finally {
      setIsLoading(false);
    }
  };

  // Wallet Connection Logic (using wagmi)
  const { address, isConnected } = useAccount();
  const { connect } = useConnect();
  const { disconnect } = useDisconnect();

  const handleConnectWallet = () => {
    // Example: Connect using the injected provider (MetaMask etc.)
    connect({ connector: injected() });
  };

  // TODO: Implement Batch Claim logic
  const handleClaim = () => {
    console.log("TODO: Initiate Batch Claim");
  };

  // Function to trigger backend scan
  const handleScan = async () => {
    console.log("Triggering GitHub scan via backend...");
    setIsLoading(true); // Use loading state for scan trigger
    setError(null);
    const token = localStorage.getItem('sessionToken'); // Get stored JWT
    if (!token) {
      setError("Not logged in.");
      setIsLoading(false);
      return;
    }

    try {
      const response = await fetch(`${BACKEND_API_URL}/api/scan/github`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json', // Even if body is empty, set content type
        },
        // body: JSON.stringify({}) // No body needed for this trigger
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: 'Failed to trigger scan' }));
        throw new Error(errorData.message || `Scan trigger failed with status: ${response.status}`);
      }

      const result = await response.json();
      console.log("Scan trigger response:", result);
      // Optionally show a success message to the user
      alert(result.message || "Scan initiated!"); // Simple alert for now
      // Maybe trigger fetchPermits again after a delay?
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unknown error occurred during scan trigger');
      console.error("Error triggering scan:", err);
    } finally {
      setIsLoading(false);
    }
  };


  // Fetch permits on component mount
  useEffect(() => {
    fetchPermits();
  }, []);


  return (
    <div>
      <h1>Permit Claiming App</h1>
      <p>Welcome! {/* TODO: Display User Info */}</p>

      {isConnected ? (
        <div>
          <p>Connected: {address}</p>
          <button onClick={() => disconnect()}>Disconnect Wallet</button>
        </div>
      ) : (
        <button onClick={handleConnectWallet}>Connect Wallet</button>
      )}

      <hr />

      <button onClick={handleScan} disabled={isLoading}>
        {isLoading ? 'Scanning...' : 'Scan GitHub for Permits'}
      </button>

      <hr />

      <h2>Your Permits</h2>
      {isLoading && <p>Loading permits...</p>}
      {error && <p style={{ color: 'red' }}>Error: {error}</p>}
      {permits.length > 0 ? (
        <>
          <table>
            <thead>
              <tr>
                <th>Type</th>
                <th>Token/NFT Address</th>
                <th>Amount</th>
                <th>Beneficiary</th>
                <th>Status</th>
                <th>Source</th>
                {/* Add more columns as needed */}
              </tr>
            </thead>
            <tbody>
              {permits.map((permit) => (
                <tr key={permit.nonce + permit.networkId}> {/* Combine nonce and networkId for key */}
                  <td>{permit.type}</td>
                  <td>{permit.tokenAddress}</td>
                  <td>{permit.amount || 'NFT'}</td>
                  <td>{permit.beneficiary}</td>
                  <td>{permit.status || 'Unknown'}</td>
                  <td><a href={permit.githubCommentUrl} target="_blank" rel="noopener noreferrer">Comment</a></td>
                </tr>
              ))}
            </tbody>
          </table>
          <button onClick={handleClaim}>Claim Selected/All Valid Permits</button>
        </>
      ) : (
        !isLoading && <p>No permits found or fetched yet.</p>
      )}
    </div>
  );
}

function GitHubCallback() {
  const location = useLocation();
  const navigate = useNavigate();
  const { login } = useAuth(); // Get login function from context
  const [message, setMessage] = useState('Processing GitHub callback...');
  const [isProcessing, setIsProcessing] = useState(false); // Add state to prevent double fetch

  useEffect(() => {
    // Prevent running the effect twice due to StrictMode or other reasons
    if (isProcessing) return;

    const searchParams = new URLSearchParams(location.search);
    const code = searchParams.get('code');
    const error = searchParams.get('error');

    if (error) {
      setMessage(`GitHub login failed: ${error}`);
      console.error("GitHub OAuth Error:", error);
      // Optionally redirect to login page after delay
      setTimeout(() => navigate('/'), 3000);
    } else if (code) {
      setMessage('GitHub login successful! Exchanging code...');
      console.log("GitHub OAuth Code:", code);
      setIsProcessing(true); // Mark as processing

      // Send 'code' to backend API to exchange for an access token
      fetch(`${BACKEND_API_URL}/api/auth/github/callback`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ code }),
      })
        .then(res => {
          if (!res.ok) {
            throw new Error(`Backend token exchange failed with status: ${res.status}`);
          }
          return res.json();
        })
        .then(data => {
          // TODO: Ensure backend returns a consistent token format (e.g., { token: "..." })
          if (data && data.token) {
            console.log("Backend token exchange successful.");
            setMessage('Login complete! Redirecting...');
            login(data.token); // Store the received session token
            navigate('/', { replace: true }); // Redirect to the main dashboard
          } else {
            throw new Error("Invalid token data received from backend.");
          }
        })
        .catch(err => {
          console.error("Backend token exchange failed:", err);
          setMessage(`Login failed: ${err.message}`);
          setIsProcessing(false); // Reset processing state on error
          setTimeout(() => navigate('/'), 3000); // Redirect back to login on error
        });

    } else {
      setMessage('Invalid GitHub callback.');
      setIsProcessing(false); // Reset processing state
      setTimeout(() => navigate('/'), 3000);
    }
  }, [location, navigate, login, isProcessing]); // Add dependencies

  return <div>{message}</div>;
}


function App() {
  const { isLoggedIn, isLoading, logout } = useAuth(); // Use auth state and logout

  const handleLogin = () => {
    // Redirect the user to GitHub for authorization
    window.location.href = GITHUB_AUTH_URL;
  };

  // TODO: Implement logout properly in DashboardPage or header component
  const handleLogout = () => {
     logout();
  };

  // Show loading indicator while checking auth status
  if (isLoading) {
    return <div>Loading...</div>;
  }

  // Return statement requires parenthesis around the JSX
  return (
    <> {/* Fragment start */}
      <Routes>
        <Route path="/github/callback" element={<GitHubCallback />} />
        <Route
          path="/"
          element={isLoggedIn ? <DashboardPage /> : <LoginPage onLogin={handleLogin} />}
        />
        {/* Add other routes as needed */}
      </Routes>
      {/* Example Logout button - move to a proper header/layout component later */}
      {isLoggedIn && <button onClick={handleLogout} style={{ position: 'absolute', top: 10, right: 10 }}>Logout</button>}
    </> // Fragment end
  ); // Parenthesis for return end
}

export default App;
