import { useEffect, useState } from 'react';
import { Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { useAccount, useConnect, useDisconnect } from 'wagmi';
import { injected } from 'wagmi/connectors'; // Example connector
import type { PermitData } from '../../shared/types'; // Import shared type
import { useAuth } from './auth-context'; // Import useAuth hook

// --- Configuration ---
// TODO: Replace with your actual GitHub OAuth App Client ID (use Vite env vars)
const GITHUB_CLIENT_ID = import.meta.env.VITE_GITHUB_CLIENT_ID || 'YOUR_GITHUB_CLIENT_ID';
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
      // const response = await fetch('/api/permits'); // Adjust API endpoint
      // if (!response.ok) {
      //   throw new Error('Failed to fetch permits');
      // }
      // const data = await response.json();
      // setPermits(data); // Assuming API returns an array of permits
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

  useEffect(() => {
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
      // TODO: Send 'code' to backend API to exchange for an access token
      // Example:
      // fetch('/api/auth/github/callback', { method: 'POST', body: JSON.stringify({ code }) })
      //   .then(res => res.json())
      //   .then(data => {
      //     // TODO: Store session token (e.g., in localStorage or context)
      //     console.log("Backend token exchange successful:", data);
      //     setMessage('Login complete! Redirecting...');
      //     // Redirect to the main dashboard
      //     navigate('/', { replace: true });
      //   })
      //   .catch(err => {
      //     console.error("Backend token exchange failed:", err);
      //     setMessage('Login failed during token exchange.');
      //     setTimeout(() => navigate('/'), 3000);
      //   });

      // Placeholder: Simulate backend token exchange and login
      setTimeout(() => {
         const fakeToken = `fake-session-token-${Date.now()}`; // Simulate receiving a token
         console.log("Placeholder: Simulating successful login with token:", fakeToken);
         login(fakeToken); // Call login from context
         navigate('/', { replace: true }); // Redirect after login
      }, 1500);

    } else {
      setMessage('Invalid GitHub callback.');
      setTimeout(() => navigate('/'), 3000);
    }
  }, [location, navigate]);

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

  return (
    <Routes>
      <Route path="/github/callback" element={<GitHubCallback />} />
      <Route
        path="/"
        element={isLoggedIn ? <DashboardPage /> : <LoginPage onLogin={handleLogin} />}
      />
      {/* Example Logout route/button - integrate properly later */}
      {isLoggedIn && <button onClick={handleLogout} style={{ position: 'absolute', top: 10, right: 10 }}>Logout</button>}
      {/* Add other routes as needed */}
    </Routes>
  );
}

export default App;
