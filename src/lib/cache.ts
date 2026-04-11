/**
 * Task 06: Self Invalidations - Cache with automatic cleanup
 *
 * Issue: https://github.com/ubiquity/pay.ubq.fi/issues/455
 *
 * Requirements:
 * - Automatic cache invalidation based on TTL
 * - Self-cleaning mechanism
 * - Memory-efficient implementation
 */

// ============================================
// Implementation: Self-Invalidating Cache
// ============================================

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
  tags: string[];
}

interface CacheOptions {
  defaultTTL?: number;
  cleanupInterval?: number;
  maxEntries?: number;
}

export class SelfInvalidatingCache<T = unknown> {
  private cache: Map<string, CacheEntry<T>> = new Map();
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;
  private readonly defaultTTL: number;
  private readonly maxEntries: number;

  constructor(options: CacheOptions = {}) {
    this.defaultTTL = options.defaultTTL ?? 5 * 60 * 1000; // 5 minutes default
    this.maxEntries = options.maxEntries ?? 10000;

    // Start automatic cleanup
    const interval = options.cleanupInterval ?? 60 * 1000; // 1 minute
    this.cleanupInterval = setInterval(() => this.cleanup(), interval);
  }

  /**
   * Set a cache entry with optional TTL and tags
   */
  set(
    key: string,
    data: T,
    options: { ttl?: number; tags?: string[] } = {}
  ): void {
    // Enforce max entries limit
    if (this.cache.size >= this.maxEntries) {
      this.evictOldest();
    }

    const ttl = options.ttl ?? this.defaultTTL;

    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl,
      tags: options.tags ?? [],
    });
  }

  /**
   * Get a cache entry, returns null if expired or not found
   */
  get(key: string): T | null {
    const entry = this.cache.get(key);

    if (!entry) {
      return null;
    }

    // Check if expired
    if (this.isExpired(entry)) {
      this.cache.delete(key);
      return null;
    }

    return entry.data;
  }

  /**
   * Check if entry exists and is valid
   */
  has(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;

    if (this.isExpired(entry)) {
      this.cache.delete(key);
      return false;
    }

    return true;
  }

  /**
   * Delete a specific entry
   */
  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  /**
   * Invalidate all entries with a specific tag
   */
  invalidateByTag(tag: string): number {
    let count = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (entry.tags.includes(tag)) {
        this.cache.delete(key);
        count++;
      }
    }

    return count;
  }

  /**
   * Invalidate all entries matching a pattern
   */
  invalidateByPattern(pattern: string | RegExp): number {
    let count = 0;
    const regex = typeof pattern === 'string' ? new RegExp(pattern) : pattern;

    for (const key of this.cache.keys()) {
      if (regex.test(key)) {
        this.cache.delete(key);
        count++;
      }
    }

    return count;
  }

  /**
   * Clear all entries
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Get cache statistics
   */
  stats(): {
    size: number;
    oldestEntry: number | null;
    newestEntry: number | null;
  } {
    const entries = Array.from(this.cache.values());

    return {
      size: this.cache.size,
      oldestEntry: entries.length > 0
        ? Math.min(...entries.map(e => e.timestamp))
        : null,
      newestEntry: entries.length > 0
        ? Math.max(...entries.map(e => e.timestamp))
        : null,
    };
  }

  /**
   * Cleanup expired entries
   */
  private cleanup(): void {
    const now = Date.now();
    let cleaned = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (this.isExpired(entry)) {
        this.cache.delete(key);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      console.log(`[Cache] Cleaned ${cleaned} expired entries`);
    }
  }

  /**
   * Check if entry is expired
   */
  private isExpired(entry: CacheEntry<T>): boolean {
    return Date.now() > entry.timestamp + entry.ttl;
  }

  /**
   * Evict oldest entries when cache is full
   */
  private evictOldest(): void {
    const entries = Array.from(this.cache.entries())
      .sort((a, b) => a[1].timestamp - b[1].timestamp);

    // Remove oldest 10%
    const toRemove = Math.ceil(entries.length * 0.1);

    for (let i = 0; i < toRemove; i++) {
      this.cache.delete(entries[i][0]);
    }
  }

  /**
   * Stop cleanup interval and destroy cache
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.cache.clear();
  }
}

// ============================================
// Specialized caches
// ============================================

/**
 * API Response Cache
 */
export class APICache extends SelfInvalidatingCache<Response> {
  constructor() {
    super({ defaultTTL: 30 * 1000 }); // 30 seconds for API responses
  }
}

/**
 * User Session Cache
 */
export class SessionCache extends SelfInvalidatingCache<{
  userId: string;
  data: Record<string, unknown>;
}> {
  constructor() {
    super({ defaultTTL: 24 * 60 * 60 * 1000 }); // 24 hours for sessions
  }

  invalidateUser(userId: string): number {
    return this.invalidateByPattern(`session:${userId}`);
  }
}

// ============================================
// Usage examples
// ============================================

// Example 1: Basic usage
const cache = new SelfInvalidatingCache<string>();

// Set with default TTL (5 minutes)
cache.set('user:123', 'John Doe');

// Set with custom TTL (1 minute)
cache.set('temp:data', 'value', { ttl: 60 * 1000 });

// Set with tags for group invalidation
cache.set('product:456', 'Widget', { tags: ['products', 'catalog'] });

// Get value
const user = cache.get('user:123'); // 'John Doe'

// Invalidate by tag
cache.invalidateByTag('products'); // Removes product:456

// Example 2: API Cache
const apiCache = new APICache();

async function fetchWithCache(url: string): Promise<Response> {
  const cached = apiCache.get(url);
  if (cached) return cached;

  const response = await fetch(url);
  apiCache.set(url, response.clone());

  return response;
}

// Example 3: Session Cache
const sessionCache = new SessionCache();

sessionCache.set('session:abc123', {
  userId: 'user-456',
  data: { theme: 'dark', notifications: true }
});

// Invalidate all sessions for a user
sessionCache.invalidateUser('user-456');

// ============================================
// Export
// ============================================

export default SelfInvalidatingCache;
