/**
 * In-memory LRU cache for routing decisions, prompt analyses, generated plans,
 * search results and summaries (Phase 12). Bounded size with TTL so it never
 * grows unbounded; single shared instance.
 */

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

export class IntelligentCache {
  private store = new Map<string, CacheEntry<unknown>>();
  private maxEntries: number;
  private defaultTtlMs: number;
  private hits = 0;
  private misses = 0;

  constructor(maxEntries = 500, defaultTtlMs = 10 * 60 * 1000) {
    this.maxEntries = maxEntries;
    this.defaultTtlMs = defaultTtlMs;
  }

  async get<T>(key: string): Promise<T | undefined> {
    const entry = this.store.get(key);
    if (!entry) {
      this.misses++;
      return undefined;
    }
    if (entry.expiresAt < Date.now()) {
      this.store.delete(key);
      this.misses++;
      return undefined;
    }
    this.hits++;
    // Refresh LRU order.
    this.store.delete(key);
    this.store.set(key, entry);
    return entry.value as T;
  }

  async set<T>(key: string, value: T, ttlMs?: number): Promise<void> {
    if (this.store.size >= this.maxEntries) {
      this.evictOldest();
    }
    this.store.set(key, {
      value,
      expiresAt: Date.now() + (ttlMs ?? this.defaultTtlMs),
    });
  }

  async has(key: string): Promise<boolean> {
    const entry = this.store.get(key);
    if (!entry) return false;
    if (entry.expiresAt < Date.now()) {
      this.store.delete(key);
      return false;
    }
    return true;
  }

  async invalidate(prefix: string): Promise<number> {
    let removed = 0;
    for (const key of [...this.store.keys()]) {
      if (key.startsWith(prefix)) {
        this.store.delete(key);
        removed++;
      }
    }
    return removed;
  }

  async clear(): Promise<void> {
    this.store.clear();
  }

  stats(): { size: number; maxEntries: number; hits: number; misses: number } {
    return { size: this.store.size, maxEntries: this.maxEntries, hits: this.hits, misses: this.misses };
  }

  private evictOldest(): void {
    const oldestKey = this.store.keys().next().value;
    if (oldestKey !== undefined) this.store.delete(oldestKey);
  }
}

export const intelligentCache = new IntelligentCache();

/** Stable cache keys. */
export const cacheKeys = {
  analysis: (input: string) => `analysis:${hash(input)}`,
  routing: (input: string) => `routing:${hash(input)}`,
  plan: (input: string) => `plan:${hash(input)}`,
  search: (query: string) => `search:${hash(query)}`,
  summary: (text: string) => `summary:${hash(text.slice(0, 500))}`,
};

function hash(input: string): string {
  let h = 0;
  for (let i = 0; i < input.length; i++) {
    h = ((h << 5) - h + input.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(36);
}
