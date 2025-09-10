// github-cache.ts: GitHub username caching utility

interface CacheEntry {
  username: string;
  timestamp: number;
}

interface GitHubCache {
  [githubUrl: string]: CacheEntry;
}

const CACHE_DURATION = 30 * 24 * 60 * 60 * 1000; // 30 days in milliseconds
const CACHE_KEY = 'github-username-cache';

// Load cache from localStorage
function loadCache(): GitHubCache {
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    return cached ? JSON.parse(cached) : {};
  } catch (error) {
    console.warn('Failed to load GitHub username cache:', error);
    return {};
  }
}

// Save cache to localStorage
function saveCache(cache: GitHubCache): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch (error) {
    console.warn('Failed to save GitHub username cache:', error);
  }
}

// Check if cache entry is valid (not expired)
function isValidCacheEntry(entry: CacheEntry): boolean {
  const now = Date.now();
  return (now - entry.timestamp) < CACHE_DURATION;
}

// Get username from cache
export function getCachedUsername(githubUrl: string): string | null {
  const cache = loadCache();
  const entry = cache[githubUrl];
  
  if (entry && isValidCacheEntry(entry)) {
    return entry.username;
  }
  
  return null;
}

// Store username in cache
export function setCachedUsername(githubUrl: string, username: string): void {
  const cache = loadCache();
  cache[githubUrl] = {
    username,
    timestamp: Date.now()
  };
  saveCache(cache);
}

// Clear expired cache entries
export function cleanupCache(): number {
  const cache = loadCache();
  let removedCount = 0;
  
  Object.keys(cache).forEach(key => {
    if (!isValidCacheEntry(cache[key])) {
      delete cache[key];
      removedCount++;
    }
  });
  
  if (removedCount > 0) {
    saveCache(cache);
  }
  
  return removedCount;
}

// Clear all cache
export function clearAllCache(): void {
  try {
    localStorage.removeItem(CACHE_KEY);
  } catch (error) {
    console.warn('Failed to clear GitHub username cache:', error);
  }
}