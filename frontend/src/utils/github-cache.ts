// GitHub username caching utility
const GITHUB_USERNAME_CACHE_KEY = "githubUsernameCache";
const CACHE_DURATION = 30 * 24 * 60 * 60 * 1000; // 30 days in milliseconds

interface GithubUserCache {
  [userId: string]: {
    username: string;
    timestamp: number;
  };
}

export class GithubUsernameCache {
  private cache: GithubUserCache;
  private pendingRequests: Map<string, Promise<string | null>>;

  constructor() {
    this.cache = this.loadCache();
    this.pendingRequests = new Map();
  }

  private loadCache(): GithubUserCache {
    try {
      const cached = localStorage.getItem(GITHUB_USERNAME_CACHE_KEY);
      if (cached) {
        const parsedCache = JSON.parse(cached) as GithubUserCache;
        // Clean expired entries
        const now = Date.now();
        const cleanedCache: GithubUserCache = {};
        for (const [userId, data] of Object.entries(parsedCache)) {
          if (now - data.timestamp < CACHE_DURATION) {
            cleanedCache[userId] = data;
          }
        }
        return cleanedCache;
      }
    } catch (e) {
      console.error("Error loading GitHub username cache:", e);
    }
    return {};
  }

  private saveCache(): void {
    try {
      localStorage.setItem(GITHUB_USERNAME_CACHE_KEY, JSON.stringify(this.cache));
    } catch (e) {
      console.error("Error saving GitHub username cache:", e);
    }
  }

  public get(userId: string): string | null {
    const cached = this.cache[userId];
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
      return cached.username;
    }
    return null;
  }

  public set(userId: string, username: string): void {
    this.cache[userId] = {
      username,
      timestamp: Date.now(),
    };
    this.saveCache();
  }

  public async fetchUsername(userId: string | number): Promise<string | null> {
    const userIdStr = String(userId);

    // Check cache first
    const cached = this.get(userIdStr);
    if (cached) {
      return cached;
    }

    // Check if there's already a pending request for this user ID
    const pendingRequest = this.pendingRequests.get(userIdStr);
    if (pendingRequest) {
      console.log(`Reusing pending request for GitHub user ${userIdStr}`);
      return pendingRequest;
    }

    // Create a new request and store it as pending
    const request = this.performFetch(userIdStr);
    this.pendingRequests.set(userIdStr, request);

    try {
      const result = await request;
      return result;
    } finally {
      // Clean up the pending request once it's done
      this.pendingRequests.delete(userIdStr);
    }
  }

  private async performFetch(userIdStr: string): Promise<string | null> {
    try {
      // Fetch from GitHub API (unauthenticated endpoint has low rate limit: 60 requests/hour)
      const response = await fetch(`https://api.github.com/user/${userIdStr}`, {
        headers: {
          'Accept': 'application/vnd.github.v3+json',
          // Add user agent to avoid potential blocking
          'User-Agent': 'Ubiquity-Pay-App'
        }
      });

      if (response.status === 404) {
        console.warn(`GitHub user with ID ${userIdStr} not found`);
        return null;
      }

      if (response.status === 403) {
        // Rate limit exceeded
        console.warn("GitHub API rate limit exceeded");
        return null;
      }

      if (!response.ok) {
        console.error(`GitHub API error: ${response.status} ${response.statusText}`);
        return null;
      }

      const data = await response.json();
      const username = data.login;

      if (username) {
        this.set(userIdStr, username);
        return username;
      }
    } catch (e) {
      console.error(`Error fetching GitHub username for ID ${userIdStr}:`, e);
    }

    return null;
  }

  // Batch fetch multiple users (more efficient for rate limits)
  public async fetchUsernames(userIds: (string | number)[]): Promise<Map<string, string>> {
    const results = new Map<string, string>();
    const uniqueIds = new Set<string>();
    const uncachedIds: string[] = [];

    // Deduplicate input IDs first
    for (const userId of userIds) {
      uniqueIds.add(String(userId));
    }

    // Check cache and pending requests first
    for (const userIdStr of uniqueIds) {
      const cached = this.get(userIdStr);
      if (cached) {
        results.set(userIdStr, cached);
      } else {
        // Check if there's a pending request
        const pending = this.pendingRequests.get(userIdStr);
        if (!pending) {
          uncachedIds.push(userIdStr);
        }
      }
    }

    // Fetch uncached usernames one by one (GitHub doesn't have a batch endpoint for this)
    // We'll limit concurrent requests to avoid rate limiting
    const CONCURRENT_LIMIT = 5;
    for (let i = 0; i < uncachedIds.length; i += CONCURRENT_LIMIT) {
      const batch = uncachedIds.slice(i, i + CONCURRENT_LIMIT);
      const promises = batch.map(id => this.fetchUsername(id));
      const batchResults = await Promise.all(promises);

      batch.forEach((id, index) => {
        const username = batchResults[index];
        if (username) {
          results.set(id, username);
        }
      });

      // Add a small delay between batches to be respectful of rate limits
      if (i + CONCURRENT_LIMIT < uncachedIds.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    // Also wait for any pending requests that were already in progress
    for (const userIdStr of uniqueIds) {
      if (!results.has(userIdStr)) {
        const pending = this.pendingRequests.get(userIdStr);
        if (pending) {
          const username = await pending;
          if (username) {
            results.set(userIdStr, username);
          }
        }
      }
    }

    return results;
  }

  // Clear the cache (useful for debugging or when needed)
  public clear(): void {
    this.cache = {};
    try {
      localStorage.removeItem(GITHUB_USERNAME_CACHE_KEY);
    } catch (e) {
      console.error("Error clearing GitHub username cache:", e);
    }
  }
}

// Singleton instance
export const githubUsernameCache = new GithubUsernameCache();