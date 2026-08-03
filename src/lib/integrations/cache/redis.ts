import Redis from 'ioredis';
import { env } from '../config/env';
import { sanitizeDetail } from '../utils/http';
import type { ProviderDefinition, ProviderHealth } from '../providers/types';

const CATEGORY = 'cache' as const;

/** Lazy singleton — created once on first access and reused. */
let redisSingleton: Redis | null = null;

function getRedisClient(): Redis | null {
  if (redisSingleton) return redisSingleton;
  if (!env.redisUrl) return null;
  redisSingleton = new Redis(env.redisUrl, {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    connectTimeout: 5_000,
    // Keep the offline queue enabled so the first command (e.g. the health
    // check PING) triggers the lazy connection instead of being rejected.
    enableOfflineQueue: true,
  });
  return redisSingleton;
}

export function getRedis(): Redis | null {
  return getRedisClient();
}

export const redisProvider: ProviderDefinition = {
  name: 'Redis',
  category: CATEGORY,
  isConfigured: () => env.redisUrl.length > 0,
  createClient: getRedisClient,
  check: async () => {
    if (!env.redisUrl) {
      return { name: 'Redis', category: CATEGORY, status: 'missing', latencyMs: 0 };
    }
    const start = Date.now();
    let client: Redis | null = null;
    try {
      client = getRedisClient();
      if (!client) {
        return { name: 'Redis', category: CATEGORY, status: 'failed', latencyMs: Date.now() - start, detail: 'no client' };
      }
      const pong = await client.ping();
      // Don't keep an idle connection alive on serverless after a health probe.
      client.disconnect();
      redisSingleton = null;
      return {
        name: 'Redis',
        category: CATEGORY,
        status: pong === 'PONG' ? 'connected' : 'failed',
        latencyMs: Date.now() - start,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        name: 'Redis',
        category: CATEGORY,
        status: 'failed',
        latencyMs: Date.now() - start,
        detail: sanitizeDetail(message),
      };
    }
  },
};
