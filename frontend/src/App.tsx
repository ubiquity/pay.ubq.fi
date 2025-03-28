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
  // State management
  const [permits, setPermits] = useState<PermitData[]>([]); // Use shared type
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch permits from backend API
  const fetchPermits = async () => {
    setIsLoading(true);
    setError(null);
    console.log("Fetching permits from backend API...");
    const token = localStorage.getItem('sessionToken'); // Get JWT from storage
    if (!token) {
      setError("Not authenticated. Please login.");
      setIsLoading(false);
      return;
    }

    try {
      const response = await fetch(`${BACKEND_API_URL}/api/permits`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/json',
        }
      });

      if (!response.ok) {
        let errorMsg = `Failed to fetch permits: ${response.status} ${response.statusText}`;
        try {
            const errorData = await response.json();
            errorMsg = errorData.error || errorMsg;
        } catch {
          /* Ignore JSON parsing error */
        }
        throw new Error(errorMsg);
      }

      const data = await response.json();
      if (!data || !Array.isArray(data.permits)) {
          console.error("Invalid permit data format received:", data);
          throw new Error("Received invalid data format for permits.");
      }

      setPermits(data.permits);
      console.log("Fetched permits:", data.permits);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unknown error occurred');
      console.error("Error fetching permits:", err);
    } finally {
      setIsLoading(false);
    }
  };

  // Wallet Connection Logic (using wagmi)
  const { address, isConnected, isConnecting } = useAccount();
  const { connect } = useConnect();
  const { disconnect } = useDisconnect();

  // Function to link wallet address to backend user record
  const linkWallet = async (connectedAddress: string) => {
      console.log(`Attempting to link wallet ${connectedAddress} to user...`);
      const token = localStorage.getItem('sessionToken');
      if (!token) {
          console.error("Cannot link wallet, user not authenticated.");
          setError("Authentication error, please re-login.");
          return;
      }
      try {
          const response = await fetch(`${BACKEND_API_URL}/api/wallet/link`, {
              method: 'POST',
              headers: {
                  'Authorization': `Bearer ${token}`,
                  'Content-Type': 'application/json',
              },
              body: JSON.stringify({ walletAddress: connectedAddress }),
          });
          if (!response.ok) {
              const errorData = await response.json().catch(() => ({ message: 'Failed to link wallet' }));
              throw new Error(errorData.error || `Failed to link wallet: ${response.status}`);
          }
          const result = await response.json();
          console.log("Wallet link response:", result);
          fetchPermits();
      } catch (error) {
          setError(error instanceof Error ? error.message : 'An unknown error occurred during wallet linking');
          console.error("Error linking wallet:", error);
      }
  };

  // Effect to link wallet once connected
  useEffect(() => {
      if (isConnected && address) {
          linkWallet(address);
      }
  }, [isConnected, address]);

  const handleConnectWallet = () => {
    if (!isConnecting) {
        connect({ connector: injected() });
    }
  };

  // Calculate human-readable amount from BigInt wei value
  const formatAmount = (weiAmount: string): string => {
    try {
      const amount = Number(BigInt(weiAmount)) / 10 ** 18;
      return amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    } catch (error) {
      console.warn("Amount formatting failed:", error);
      return '0.00';
    }
  };

  // Check if a permit has all required fields for testing/claiming
  const hasRequiredFields = (permit: PermitData): boolean => {
    const logPrefix = `Permit ${permit.nonce}:`;
    let isValid = true;

    if (!permit.nonce) { console.warn(logPrefix, "Missing nonce"); isValid = false; }
    if (!permit.networkId) { console.warn(logPrefix, "Missing networkId"); isValid = false; }
    if (!permit.deadline) { console.warn(logPrefix, "Missing deadline"); isValid = false; }
    if (!permit.beneficiary) { console.warn(logPrefix, "Missing beneficiary"); isValid = false; }
    if (!permit.owner) { console.warn(logPrefix, "Missing owner"); isValid = false; }
    if (!permit.signature) { console.warn(logPrefix, "Missing signature"); isValid = false; }
    if (!permit.token?.address) { console.warn(logPrefix, "Missing token address"); isValid = false; }

    // Type-specific checks
    if (permit.type === 'erc20-permit') {
      if (!permit.amount) { console.warn(logPrefix, "Missing amount for ERC20"); isValid = false; }
    } else if (permit.type === 'erc721-permit') {
      if (permit.token_id === undefined || permit.token_id === null) { console.warn(logPrefix, "Missing token_id for ERC721"); isValid = false; }
    } else {
      console.warn(logPrefix, "Unknown permit type:", permit.type);
      isValid = false;
    }

    if (!isValid) {
      console.warn(logPrefix, "Permit data:", permit);
    }
    return isValid;
  };

  // Test claiming a single permit
  const handleTestClaim = async (permitToTest: PermitData) => {
    if (!isConnected || !address) {
      setError("Please connect your wallet first");
      return;
    }

    if (!hasRequiredFields(permitToTest)) {
      setPermits(currentPermits =>
        currentPermits.map(p =>
          p.nonce === permitToTest.nonce && p.networkId === permitToTest.networkId
            ? { ...p, status: 'TestFailed', error: 'Permit missing required fields' }
            : p
        )
      );
      return;
    }

    // Update permit status to Testing
    setPermits(currentPermits =>
      currentPermits.map(p =>
        p.nonce === permitToTest.nonce && p.networkId === permitToTest.networkId
          ? { ...p, status: 'Testing', error: undefined }
          : p
      )
    );

    try {
      // Make API call to test the permit
      const token = localStorage.getItem('sessionToken');
      const response = await fetch(`${BACKEND_API_URL}/api/permits/test`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...permitToTest,
          tokenAddress: permitToTest.token?.address,
          walletAddress: address,
          networkId: permitToTest.networkId || permitToTest.token?.network
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Failed to test permit' }));
        throw new Error(errorData.error || `Failed to test permit: ${response.status}`);
      }

      const result = await response.json();

      // Update permit status based on test result
      setPermits(currentPermits =>
        currentPermits.map(p =>
          p.nonce === permitToTest.nonce && p.networkId === permitToTest.networkId
            ? {
                ...p,
                status: result.isValid ? 'TestSuccess' : 'TestFailed',
                error: result.error
              }
            : p
        )
      );

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred';
      // Update permit with error state
      setPermits(currentPermits =>
        currentPermits.map(p =>
          p.nonce === permitToTest.nonce && p.networkId === permitToTest.networkId
            ? { ...p, status: 'TestFailed', error: errorMessage }
            : p
        )
      );
      console.error("Error testing permit:", err);
    }
  };

  useEffect(() => {
    fetchPermits();
  }, []);

  return (
    <div>
      <h1>Permit Claiming App</h1>
      <p>Welcome!</p>

      {isConnected ? (
        <div>
          <p>Connected: {address}</p>
          <button onClick={() => disconnect()}>Disconnect Wallet</button>
        </div>
      ) : (
        <button onClick={handleConnectWallet} disabled={isConnecting}>
            {isConnecting ? 'Connecting...' : 'Connect Wallet'}
        </button>
      )}

      <hr />

      <h2>Your Permits</h2>
      {isLoading && <p>Loading permits...</p>}
      {error && <p style={{ color: 'red' }}>Error: {error}</p>}
      {/* Summary Info */}
      {permits.length > 0 && (
        <div style={{ marginBottom: '20px' }}>
          <p>Found {permits.length} permits total.</p>
          <p>{permits.filter(hasRequiredFields).length} permits have valid data for testing.</p>
          <p>{permits.filter(p => p.status === 'TestSuccess').length} permits passed test validation.</p>
        </div>
      )}

      {permits.length > 0 ? (
        <>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ padding: '8px', borderBottom: '1px solid #ddd' }}>Type</th>
                <th style={{ padding: '8px', borderBottom: '1px solid #ddd' }}>Token/NFT Address</th>
                <th style={{ padding: '8px', borderBottom: '1px solid #ddd', textAlign: 'right' }}>Amount</th>
                <th style={{ padding: '8px', borderBottom: '1px solid #ddd' }}>Beneficiary</th>
                <th style={{ padding: '8px', borderBottom: '1px solid #ddd' }}>Status</th>
                <th style={{ padding: '8px', borderBottom: '1px solid #ddd' }}>Source</th>
                <th style={{ padding: '8px', borderBottom: '1px solid #ddd' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {permits.map((permit) => (
                <tr key={permit.nonce + permit.networkId} style={{
                  backgroundColor: !hasRequiredFields(permit) ? '#fff4f4' :
                                 permit.status === 'TestSuccess' ? '#f4fff4' :
                                 permit.status === 'TestFailed' ? '#fff4f4' :
                                 'transparent'
                }}>
                  <td style={{ padding: '8px', borderBottom: '1px solid #ddd' }}>
                    {permit.amount ? 'ERC20' : 'NFT'}
                  </td>
                  <td style={{ padding: '8px', borderBottom: '1px solid #ddd', fontFamily: 'monospace', fontSize: '0.9em' }}>
                    {permit.token?.address || permit.tokenAddress || 'Missing Address'}
                    {permit.networkId && <span style={{ fontSize: '0.8em', color: '#666', marginLeft: '5px' }}>
                      ({permit.networkId === 100 ? 'WXDAI' : 'ETH'})
                    </span>}
                  </td>
                  <td style={{ padding: '8px', borderBottom: '1px solid #ddd', textAlign: 'right', fontFamily: 'monospace' }}>
                    {permit.amount ? formatAmount(permit.amount) : 'NFT'}
                  </td>
                  <td style={{ padding: '8px', borderBottom: '1px solid #ddd', fontFamily: 'monospace', fontSize: '0.9em' }}>{permit.beneficiary}</td>
                  <td style={{ padding: '8px', borderBottom: '1px solid #ddd' }}>
                    <div style={{
                      color: permit.status === 'TestSuccess' ? '#1a8917' :
                             permit.status === 'TestFailed' ? '#d73a49' :
                             permit.status === 'Testing' ? '#b08800' : '#666',
                      fontWeight: permit.status ? 'bold' : 'normal'
                    }}>
                      {permit.status || 'Ready'}
                    </div>
                  </td>
                  <td style={{ padding: '8px', borderBottom: '1px solid #ddd' }}>
                    {permit.githubCommentUrl ? (
                      <a href={permit.githubCommentUrl} target="_blank" rel="noopener noreferrer">Comment</a>
                    ) : (
                      'N/A'
                    )}
                  </td>
                  <td style={{ padding: '8px', borderBottom: '1px solid #ddd' }}>
                    <button
                      onClick={() => handleTestClaim(permit)}
                      disabled={!isConnected || permit.status === 'Testing' || permit.status === 'TestSuccess' || !hasRequiredFields(permit)}
                    >
                      {permit.status === 'Testing' ? 'Testing...' :
                       permit.status === 'TestSuccess' ? 'Valid!' :
                       permit.status === 'TestFailed' ? 'Test Failed' :
                       !hasRequiredFields(permit) ? 'Invalid Data' : 'Test Claim'}
                    </button>
                    {permit.error && <div style={{ color: 'red', fontSize: '0.8em' }}>{permit.error}</div>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
  const { login } = useAuth();
  const [message, setMessage] = useState('Processing GitHub callback...');
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    if (isProcessing) return;

    const searchParams = new URLSearchParams(location.search);
    const code = searchParams.get('code');
    const error = searchParams.get('error');

    if (error) {
      setMessage(`GitHub login failed: ${error}`);
      console.error("GitHub OAuth Error:", error);
      setTimeout(() => navigate('/'), 3000);
    } else if (code) {
      setMessage('GitHub login successful! Exchanging code...');
      console.log("GitHub OAuth Code:", code);
      setIsProcessing(true);

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
          if (data && data.token) {
            console.log("Backend token exchange successful.");
            setMessage('Login complete! Redirecting...');
            login(data.token);
            navigate('/', { replace: true });
          } else {
            throw new Error("Invalid token data received from backend.");
          }
        })
        .catch(err => {
          console.error("Backend token exchange failed:", err);
          setMessage(`Login failed: ${err.message}`);
          setIsProcessing(false);
          setTimeout(() => navigate('/'), 3000);
        });

    } else {
      setMessage('Invalid GitHub callback.');
      setIsProcessing(false);
      setTimeout(() => navigate('/'), 3000);
    }
  }, [location, navigate, login, isProcessing]);

  return <div>{message}</div>;
}

function App() {
  const { isLoggedIn, isLoading, logout } = useAuth();

  const handleLogin = () => {
    window.location.href = GITHUB_AUTH_URL;
  };

  const handleLogout = () => {
     logout();
  };

  if (isLoading) {
    return <div>Loading...</div>;
  }

  return (
    <>
      <Routes>
        <Route path="/github/callback" element={<GitHubCallback />} />
        <Route
          path="/"
          element={isLoggedIn ? <DashboardPage /> : <LoginPage onLogin={handleLogin} />}
        />
      </Routes>
      {isLoggedIn && <button onClick={handleLogout} style={{ position: 'absolute', top: 10, right: 10 }}>Logout</button>}
    </>
  );
}

export default App;
