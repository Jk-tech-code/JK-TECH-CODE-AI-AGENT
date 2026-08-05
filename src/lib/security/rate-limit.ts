/**
 * Lightweight in-process rate limiter for API routes.
 *
 * Sliding-window token bucket keyed by an arbitrary string (user id, IP, …).
 * In-memory by design (per instance) — adequate for single-server deployments;
 * swap for Redis in a multi-instance setup. Never throws.
 */

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();
const MAX_BUCKETS = 10_000;

/** Periodic sweep so the map never grows unbounded. */
setInterval(() => {
  const now = Date.now();
  for (const [key, b] of buckets) {
    if (now > b.resetAt) buckets.delete(key);
  }
}, 60_000).unref?.();

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
  limit: number;
}

export function rateLimit(
  key: string,
  options: { limit?: number; windowMs?: number } = {},
): RateLimitResult {
  const limit = options.limit ?? 20;
  const windowMs = options.windowMs ?? 60_000;
  const now = Date.now();

  if (buckets.size >= MAX_BUCKETS && !buckets.has(key)) {
    // Defensive: avoid unbounded growth on adversarial key generation.
    return { allowed: true, remaining: limit - 1, resetAt: now + windowMs, limit };
  }

  const entry = buckets.get(key);
  if (!entry || now > entry.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: limit - 1, resetAt: now + windowMs, limit };
  }

  if (entry.count >= limit) {
    return { allowed: false, remaining: 0, resetAt: entry.resetAt, limit };
  }

  entry.count++;
  return { allowed: true, remaining: limit - entry.count, resetAt: entry.resetAt, limit };
}
