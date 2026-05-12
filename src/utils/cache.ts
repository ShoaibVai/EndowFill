/**
 * utils/cache.ts — In-memory TTL cache singleton.
 *
 * Features:
 * - Generic typed get<T> / set / invalidate / clear API
 * - Per-entry TTL (milliseconds)
 * - Automatic stale-entry eviction on read
 * - flush() clears all entries (call on sign-out)
 *
 * Recommended TTLs:
 *   Session data  → SESSION_TTL  (30 minutes)
 *   Query results → QUERY_TTL    (5 minutes)
 */

export const SESSION_TTL = 30 * 60 * 1000; // 30 min
export const QUERY_TTL   =  5 * 60 * 1000; // 5 min

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

class TTLCache {
  private store = new Map<string, CacheEntry<unknown>>();

  /** Retrieve a cached value. Returns undefined if missing or expired. */
  get<T>(key: string): T | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return undefined;
    }
    return entry.value as T;
  }

  /** Store a value with a TTL (ms). */
  set<T>(key: string, value: T, ttlMs: number): void {
    this.store.set(key, { value, expiresAt: Date.now() + ttlMs });
  }

  /** Remove a single entry. */
  invalidate(key: string): void {
    this.store.delete(key);
  }

  /** Remove all entries whose key starts with a given prefix. */
  invalidatePrefix(prefix: string): void {
    for (const key of this.store.keys()) {
      if (key.startsWith(prefix)) this.store.delete(key);
    }
  }

  /** Remove every entry — call on sign-out. */
  flush(): void {
    this.store.clear();
  }

  /** How many live entries are currently cached (informational). */
  get size(): number {
    return this.store.size;
  }
}

// Export as a singleton so the same instance is used across the app.
export const cache = new TTLCache();
