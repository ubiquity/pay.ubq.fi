// use-github-usernames.ts: Hook for fetching and caching GitHub usernames

import { useCallback, useEffect, useState } from 'react';
import { getCachedUsername, setCachedUsername, cleanupCache } from '../utils/github-cache.ts';
import { extractGitHubUsername } from '../utils/format-utils.ts';

interface GitHubUsernames {
  [githubUrl: string]: string | null;
}

interface UseGitHubUsernamesReturn {
  usernames: GitHubUsernames;
  fetchUsername: (githubUrl: string) => Promise<string | null>;
  isLoading: boolean;
  error: string | null;
}

// Rate limiting configuration
const RATE_LIMIT_DELAY = 1000; // 1 second between requests
const MAX_CONCURRENT_REQUESTS = 3;

// Queue for managing API requests
interface RequestQueue {
  url: string;
  resolve: (username: string | null) => void;
  reject: (error: Error) => void;
}

let requestQueue: RequestQueue[] = [];
let activeRequests = 0;
let lastRequestTime = 0;

// Process the request queue with rate limiting
function processQueue() {
  if (activeRequests >= MAX_CONCURRENT_REQUESTS || requestQueue.length === 0) {
    return;
  }

  const now = Date.now();
  const timeSinceLastRequest = now - lastRequestTime;
  
  if (timeSinceLastRequest < RATE_LIMIT_DELAY) {
    setTimeout(processQueue, RATE_LIMIT_DELAY - timeSinceLastRequest);
    return;
  }

  const { url, resolve, reject } = requestQueue.shift()!;
  activeRequests++;
  lastRequestTime = now;

  fetchUsernameFromGitHubAPI(url)
    .then(username => {
      resolve(username);
      activeRequests--;
      setTimeout(processQueue, RATE_LIMIT_DELAY);
    })
    .catch(error => {
      reject(error);
      activeRequests--;
      setTimeout(processQueue, RATE_LIMIT_DELAY);
    });
}

// Add request to queue
function queueRequest(url: string): Promise<string | null> {
  return new Promise((resolve, reject) => {
    requestQueue.push({ url, resolve, reject });
    processQueue();
  });
}

// Fetch username from GitHub API
async function fetchUsernameFromGitHubAPI(githubUrl: string): Promise<string | null> {
  try {
    const username = extractGitHubUsername(githubUrl);
    if (!username) {
      return null;
    }

    const response = await fetch(`https://api.github.com/users/${username}`);
    
    if (response.status === 404) {
      return null;
    }
    
    if (response.status === 403) {
      // Rate limited, but we still know the username from URL
      return username;
    }
    
    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.status}`);
    }

    const userData = await response.json();
    return userData.login || username;
  } catch (error) {
    console.warn('Failed to fetch GitHub username:', error);
    // Fallback to extracted username if API fails
    return extractGitHubUsername(githubUrl);
  }
}

export function useGitHubUsernames(): UseGitHubUsernamesReturn {
  const [usernames, setUsernames] = useState<GitHubUsernames>({});
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Cleanup expired cache entries on mount
  useEffect(() => {
    const removedCount = cleanupCache();
    if (removedCount > 0) {
      console.log(`Cleaned up ${removedCount} expired GitHub username cache entries`);
    }
  }, []);

  const fetchUsername = useCallback(async (githubUrl: string): Promise<string | null> => {
    if (!githubUrl) {
      return null;
    }

    // Check cache first
    const cached = getCachedUsername(githubUrl);
    if (cached) {
      setUsernames(prev => ({ ...prev, [githubUrl]: cached }));
      return cached;
    }

    // Check if already in state
    if (usernames[githubUrl] !== undefined) {
      return usernames[githubUrl];
    }

    setIsLoading(true);
    setError(null);

    try {
      const username = await queueRequest(githubUrl);
      
      // Cache the result (even if null)
      if (username) {
        setCachedUsername(githubUrl, username);
      }
      
      setUsernames(prev => ({ ...prev, [githubUrl]: username }));
      return username;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      console.error('Failed to fetch GitHub username:', errorMessage);
      setError(errorMessage);
      
      // Try to extract username from URL as fallback
      const fallbackUsername = extractGitHubUsername(githubUrl);
      setUsernames(prev => ({ ...prev, [githubUrl]: fallbackUsername }));
      return fallbackUsername;
    } finally {
      setIsLoading(false);
    }
  }, [usernames]);

  return {
    usernames,
    fetchUsername,
    isLoading,
    error,
  };
}