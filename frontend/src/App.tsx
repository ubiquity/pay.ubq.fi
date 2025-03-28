import React from 'react'; // Removed unused useEffect, useState
import { Route, Routes } from 'react-router-dom'; // Removed useLocation, useNavigate
import { useAuth } from './auth-context'; // Import useAuth hook

// Import extracted components
import { LoginPage } from './components/login-page';
import { DashboardPage } from './components/dashboard-page';
import { GitHubCallback } from './components/github-callback';

// --- Configuration ---
// Moved GITHUB_CLIENT_ID, BACKEND_API_URL to relevant components
// Kept GITHUB_AUTH_URL here as it's used in App component logic
const GITHUB_CLIENT_ID = import.meta.env.VITE_GITHUB_CLIENT_ID; // Still needed for GITHUB_AUTH_URL
const GITHUB_REDIRECT_URI = `${window.location.origin}/github/callback`;
const GITHUB_AUTH_URL = `https://github.com/login/oauth/authorize?client_id=${GITHUB_CLIENT_ID}&redirect_uri=${encodeURIComponent(GITHUB_REDIRECT_URI)}&scope=read:user`;

if (!GITHUB_CLIENT_ID) {
  console.error("Error: VITE_GITHUB_CLIENT_ID is not defined in your .env file.");
}

// --- Permit2 Contract Details ---
// Moved PERMIT2_ADDRESS and permit2ABI import to DashboardPage

// --- Components ---
// Moved LoginPage, DashboardPage, GitHubCallback definitions to separate files

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
      {isLoggedIn && <button onClick={handleLogout} className="logout-button">Logout</button>}
    </>
  );
}

export default App;
