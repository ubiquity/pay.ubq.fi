/**
 * Simple GitHub username cache to avoid rate limiting
 */
class GitHubUsernameCache {
  private cache = new Map<string, string>();

  get(userId: string): string | undefined {
    return this.cache.get(userId);
  }

  set(userId: string, username: string): void {
    this.cache.set(userId, username);
  }

  async fetchUsername(userId: number): Promise<string | null> {
    const userIdStr = String(userId);

    // Check cache first
    const cached = this.get(userIdStr);
    if (cached) {
      return cached;
    }

    try {
      // Fetch from GitHub API
      const response = await fetch(`https://api.github.com/user/${userId}`);
      if (!response.ok) {
        console.warn(`Failed to fetch user ${userId}: ${response.status}`);
        return null;
      }

      const userData = await response.json();
      const username = userData.login;

      if (username) {
        this.set(userIdStr, username);
        return username;
      }

      return null;
    } catch (error) {
      console.error(`Error fetching username for user ${userId}:`, error);
      return null;
    }
  }
}

export const githubUsernameCache = new GitHubUsernameCache();
