/**
 * Persistent GitHub username cache to avoid rate limiting.
 * Stores usernames by GitHub numeric user id with a 30‑day TTL.
 */

const STORAGE_KEY = "githubUsernameCache";
const TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

type CacheEntry = {
  username: string;
  fetchedAt: number;
};

class GitHubUsernameCache {
  private cache = new Map<string, CacheEntry>();
  private loaded = false;
  private inFlight = new Map<string, Promise<string | null>>();

  private load(): void {
    if (this.loaded) return;
    this.loaded = true;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Record<string, CacheEntry>;
      Object.entries(parsed).forEach(([id, entry]) => {
        if (entry?.username && entry?.fetchedAt) {
          this.cache.set(id, entry);
        }
      });
    } catch {
      // ignore cache load errors
    }
  }

  private persist(): void {
    try {
      const obj: Record<string, CacheEntry> = {};
      this.cache.forEach((entry, id) => {
        obj[id] = entry;
      });
      localStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
    } catch {
      // ignore cache persist errors
    }
  }

  get(userId: string): string | undefined {
    this.load();
    const entry = this.cache.get(userId);
    if (!entry) return undefined;
    if (Date.now() - entry.fetchedAt > TTL_MS) {
      this.cache.delete(userId);
      this.persist();
      return undefined;
    }
    return entry.username;
  }

  set(userId: string, username: string): void {
    this.load();
    this.cache.set(userId, { username, fetchedAt: Date.now() });
    this.persist();
  }

  async fetchUsername(userId: number): Promise<string | null> {
    const userIdStr = String(userId);

    const cached = this.get(userIdStr);
    if (cached) return cached;

    const existing = this.inFlight.get(userIdStr);
    if (existing) return existing;

    const promise = (async () => {
      try {
        const response = await fetch(`https://api.github.com/user/${userId}`);
        if (!response.ok) {
          console.warn(`Failed to fetch GitHub user ${userId}: ${response.status}`);
          return null;
        }
        const userData = (await response.json()) as { login?: string };
        const username = userData.login;
        if (username) {
          this.set(userIdStr, username);
          return username;
        }
        return null;
      } catch (error) {
        console.error(`Error fetching GitHub username for user ${userId}:`, error);
        return null;
      } finally {
        this.inFlight.delete(userIdStr);
      }
    })();

    this.inFlight.set(userIdStr, promise);
    return promise;
  }
}

export const githubUsernameCache = new GitHubUsernameCache();

