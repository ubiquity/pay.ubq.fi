/**
 * Persistent GitHub username cache to avoid rate limiting.
 * Stores usernames by GitHub numeric user id with a 30‑day TTL.
 */

const STORAGE_KEY = "githubUsernameCache";
const NOT_FOUND_STORAGE_KEY = "githubUsernameNotFoundCache";
const RATE_LIMIT_STORAGE_KEY = "githubUsernameRateLimit";
const TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const NOT_FOUND_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

type CacheEntry = {
  username: string;
  fetchedAt: number;
};

type NotFoundEntry = {
  fetchedAt: number;
};

type RateLimitState = {
  remaining: number | null;
  resetAtMs: number | null;
  limitedUntilMs: number | null;
};

class GitHubUsernameCache {
  private cache = new Map<string, CacheEntry>();
  private notFoundCache = new Map<string, NotFoundEntry>();
  private loaded = false;
  private inFlight = new Map<string, Promise<string | null>>();
  private rateLimit: RateLimitState = { remaining: null, resetAtMs: null, limitedUntilMs: null };

  private load(): void {
    if (this.loaded) return;
    this.loaded = true;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Record<string, CacheEntry>;
        Object.entries(parsed).forEach(([id, entry]) => {
          if (entry?.username && entry?.fetchedAt) {
            this.cache.set(id, entry);
          }
        });
      }
    } catch {
      // ignore cache load errors
    }

    try {
      const raw = localStorage.getItem(NOT_FOUND_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Record<string, NotFoundEntry>;
        Object.entries(parsed).forEach(([id, entry]) => {
          if (entry?.fetchedAt) {
            this.notFoundCache.set(id, entry);
          }
        });
      }
    } catch {
      // ignore cache load errors
    }

    try {
      const raw = localStorage.getItem(RATE_LIMIT_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<RateLimitState>;
        const remaining = typeof parsed.remaining === "number" && Number.isFinite(parsed.remaining) ? parsed.remaining : null;
        const resetAtMs = typeof parsed.resetAtMs === "number" && Number.isFinite(parsed.resetAtMs) ? parsed.resetAtMs : null;
        const limitedUntilMs = typeof parsed.limitedUntilMs === "number" && Number.isFinite(parsed.limitedUntilMs) ? parsed.limitedUntilMs : null;
        this.rateLimit = { remaining, resetAtMs, limitedUntilMs };
      }
    } catch {
      // ignore rate limit load errors
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

  private persistNotFound(): void {
    try {
      const obj: Record<string, NotFoundEntry> = {};
      this.notFoundCache.forEach((entry, id) => {
        obj[id] = entry;
      });
      localStorage.setItem(NOT_FOUND_STORAGE_KEY, JSON.stringify(obj));
    } catch {
      // ignore cache persist errors
    }
  }

  private persistRateLimit(): void {
    try {
      localStorage.setItem(RATE_LIMIT_STORAGE_KEY, JSON.stringify(this.rateLimit));
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

  isNotFound(userId: string): boolean {
    this.load();
    const entry = this.notFoundCache.get(userId);
    if (!entry) return false;
    if (Date.now() - entry.fetchedAt > NOT_FOUND_TTL_MS) {
      this.notFoundCache.delete(userId);
      this.persistNotFound();
      return false;
    }
    return true;
  }

  set(userId: string, username: string): void {
    this.load();
    this.cache.set(userId, { username, fetchedAt: Date.now() });
    this.persist();
  }

  getRateLimit(): { remaining: number | null; resetAtMs: number | null } {
    this.load();
    const resetAtMs = this.rateLimit.limitedUntilMs ?? this.rateLimit.resetAtMs;
    return { remaining: this.rateLimit.remaining, resetAtMs };
  }

  isRateLimited(): boolean {
    this.load();
    const now = Date.now();
    const until = this.rateLimit.limitedUntilMs;
    if (until == null) return false;
    if (now >= until) {
      this.rateLimit.limitedUntilMs = null;
      if (this.rateLimit.resetAtMs != null && now >= this.rateLimit.resetAtMs) {
        this.rateLimit.resetAtMs = null;
        this.rateLimit.remaining = null;
      }
      this.persistRateLimit();
      return false;
    }
    return true;
  }

  private markRateLimited(untilMs: number, resetAtMs: number | null, remaining: number | null): void {
    const nextUntil = Math.max(this.rateLimit.limitedUntilMs ?? 0, untilMs);
    this.rateLimit.limitedUntilMs = nextUntil;
    if (typeof remaining === "number" && Number.isFinite(remaining)) {
      this.rateLimit.remaining = remaining;
    }
    if (typeof resetAtMs === "number" && Number.isFinite(resetAtMs)) {
      this.rateLimit.resetAtMs = Math.max(this.rateLimit.resetAtMs ?? 0, resetAtMs);
    }
    this.persistRateLimit();
  }

  private updateRateLimitFromHeaders(headers: Headers): void {
    const remainingHeader = headers.get("X-RateLimit-Remaining");
    const resetHeader = headers.get("X-RateLimit-Reset");
    const retryAfterHeader = headers.get("Retry-After");

    const remaining = remainingHeader != null ? Number(remainingHeader) : null;
    const resetUnixSeconds = resetHeader != null ? Number(resetHeader) : null;
    const retryAfterSeconds = retryAfterHeader != null ? Number(retryAfterHeader) : null;

    if (typeof remaining === "number" && Number.isFinite(remaining)) {
      this.rateLimit.remaining = remaining;
    }
    if (typeof resetUnixSeconds === "number" && Number.isFinite(resetUnixSeconds)) {
      this.rateLimit.resetAtMs = resetUnixSeconds * 1000;
    }

    const now = Date.now();
    if (typeof retryAfterSeconds === "number" && Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0) {
      this.markRateLimited(now + retryAfterSeconds * 1000, null, this.rateLimit.remaining);
      return;
    }

    if (this.rateLimit.remaining === 0 && this.rateLimit.resetAtMs != null) {
      this.markRateLimited(this.rateLimit.resetAtMs, this.rateLimit.resetAtMs, this.rateLimit.remaining);
    } else {
      this.persistRateLimit();
    }
  }

  async fetchUsername(userId: number): Promise<string | null> {
    const userIdStr = String(userId);

    const cached = this.get(userIdStr);
    if (cached) return cached;

    const existing = this.inFlight.get(userIdStr);
    if (existing) return existing;

    if (this.isNotFound(userIdStr)) return null;
    if (this.isRateLimited()) return null;

    const promise = (async () => {
      try {
        const response = await fetch(`https://api.github.com/user/${userId}`);
        this.updateRateLimitFromHeaders(response.headers);
        if (!response.ok) {
          if (response.status === 404) {
            this.notFoundCache.set(userIdStr, { fetchedAt: Date.now() });
            this.persistNotFound();
            return null;
          }

          if (response.status === 403 || response.status === 429) {
            const now = Date.now();
            const retryAfterHeader = response.headers.get("Retry-After");
            const retryAfterSeconds = retryAfterHeader != null ? Number(retryAfterHeader) : null;
            if (typeof retryAfterSeconds === "number" && Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0) {
              this.markRateLimited(now + retryAfterSeconds * 1000, null, this.rateLimit.remaining);
            } else if (this.rateLimit.resetAtMs != null) {
              this.markRateLimited(this.rateLimit.resetAtMs, this.rateLimit.resetAtMs, this.rateLimit.remaining);
            } else {
              this.markRateLimited(now + 60 * 1000, null, this.rateLimit.remaining);
            }
          }

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
