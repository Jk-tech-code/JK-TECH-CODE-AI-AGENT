import { QdrantClient } from '@qdrant/js-client-rest';
import { env } from '../config/env';
import { sanitizeDetail } from '../utils/http';
import type { ProviderDefinition, ProviderHealth } from '../providers/types';

const CATEGORY = 'vector' as const;

/** Lazy singleton — created once on first access and reused. */
let qdrantSingleton: QdrantClient | null = null;

function getQdrantClient(): QdrantClient | null {
  if (qdrantSingleton) return qdrantSingleton;
  if (!env.qdrant.url) return null;
  qdrantSingleton = new QdrantClient({
    url: env.qdrant.url,
    ...(env.qdrant.apiKey ? { apiKey: env.qdrant.apiKey } : {}),
    // Skip the pre-flight server-version handshake so health checks make a
    // single request to /collections instead of two round trips.
    checkCompatibility: false,
  });
  return qdrantSingleton;
}

export function getQdrant(): QdrantClient | null {
  return getQdrantClient();
}

export const qdrantProvider: ProviderDefinition = {
  name: 'Qdrant',
  category: CATEGORY,
  isConfigured: () => env.qdrant.url.length > 0,
  createClient: getQdrantClient,
  check: async () => {
    if (!env.qdrant.url) {
      return { name: 'Qdrant', category: CATEGORY, status: 'missing', latencyMs: 0 };
    }
    const start = Date.now();
    try {
      const client = getQdrantClient();
      if (!client) {
        return { name: 'Qdrant', category: CATEGORY, status: 'failed', latencyMs: Date.now() - start, detail: 'no client' };
      }
      await client.getCollections();
      return {
        name: 'Qdrant',
        category: CATEGORY,
        status: 'connected',
        latencyMs: Date.now() - start,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        name: 'Qdrant',
        category: CATEGORY,
        status: 'failed',
        latencyMs: Date.now() - start,
        detail: sanitizeDetail(message),
      };
    }
  },
};
