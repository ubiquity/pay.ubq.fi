import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth-context'; // Adjust path based on new location

// Assuming BACKEND_API_URL is accessible, e.g., via import.meta.env or context
const BACKEND_API_URL = import.meta.env.VITE_BACKEND_API_URL || 'http://localhost:8000';

export function GitHubCallback() {
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
